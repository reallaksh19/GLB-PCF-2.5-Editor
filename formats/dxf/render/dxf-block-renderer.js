/**
 * formats/dxf/render/dxf-block-renderer.js
 *
 * Block instance projection with recursive transform stack.
 * Projects block definitions into render space for INSERT instances without
 * mutating or duplicating source model ownership.
 */

import { resolveEntityStyle } from './dxf-style-resolver.js';

export const MAX_BLOCK_DEPTH = 16;

/**
 * Creates an affine 3D transform object for an INSERT entity.
 *
 * @param {Object} [point] - Insertion point {x, y, z}
 * @param {Object} [scale] - Scale factors {x, y, z}
 * @param {number} [rotationDeg=0] - Rotation angle in degrees around Z
 * @returns {Object}
 */
export function createInsertTransform(point = {}, scale = {}, rotationDeg = 0) {
  const rad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const sx = Number.isFinite(Number(scale.x)) ? Number(scale.x) : 1;
  const sy = Number.isFinite(Number(scale.y)) ? Number(scale.y) : 1;
  const sz = Number.isFinite(Number(scale.z)) ? Number(scale.z) : 1;

  return {
    translation: {
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      z: Number(point.z) || 0,
    },
    scale: { x: sx, y: sy, z: sz },
    rotationDeg: Number(rotationDeg) || 0,
    rotationRad: rad,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
  };
}

/**
 * Transform a 3D point through an insert transform and block base point offset.
 *
 * @param {Object} pt - {x, y, z}
 * @param {Object} transform - Insert transform
 * @param {Object} [basePoint] - Block definition base point {x, y, z}
 * @returns {{x: number, y: number, z: number}}
 */
export function transformPoint(pt, transform, basePoint = { x: 0, y: 0, z: 0 }) {
  const px = Number(pt?.x) || 0;
  const py = Number(pt?.y) || 0;
  const pz = Number(pt?.z) || 0;

  const bx = Number(basePoint?.x) || 0;
  const by = Number(basePoint?.y) || 0;
  const bz = Number(basePoint?.z) || 0;

  const t = transform || createInsertTransform();

  // 1. Shift by base point
  const lx = (px - bx) * t.scale.x;
  const ly = (py - by) * t.scale.y;
  const lz = (pz - bz) * t.scale.z;

  // 2. Rotate around Z
  const rx = lx * t.cos - ly * t.sin;
  const ry = lx * t.sin + ly * t.cos;
  const rz = lz;

  // 3. Translate
  return {
    x: t.translation.x + rx,
    y: t.translation.y + ry,
    z: t.translation.z + rz,
  };
}

/**
 * Compose a parent transform with a nested child transform.
 *
 * @param {Object} parentTransform
 * @param {Object} childTransform
 * @param {Object} [childBasePoint]
 * @returns {Object}
 */
export function composeTransforms(parentTransform, childTransform, childBasePoint = { x: 0, y: 0, z: 0 }) {
  const p = parentTransform || createInsertTransform();
  const c = childTransform || createInsertTransform();

  // Child insertion point in parent space
  const worldInsertion = transformPoint(c.translation, p, childBasePoint);

  const combinedRotRad = p.rotationRad + c.rotationRad;
  const combinedRotDeg = (combinedRotRad * 180) / Math.PI;

  return {
    translation: worldInsertion,
    scale: {
      x: p.scale.x * c.scale.x,
      y: p.scale.y * c.scale.y,
      z: p.scale.z * c.scale.z,
    },
    rotationDeg: combinedRotDeg,
    rotationRad: combinedRotRad,
    cos: Math.cos(combinedRotRad),
    sin: Math.sin(combinedRotRad),
  };
}

/**
 * Recursively project an INSERT instance into transformed primitives.
 *
 * @param {import('../model/dxf-entity.js').DxfEntity} insertEntity - The INSERT entity
 * @param {import('../model/dxf-document.js').DxfDocument} document - The DXF document
 * @param {Object} options - Projection options
 * @param {Function} projectChildCallback - (childEntity, resolvedStyle, composedTransform, blockContext) => void
 * @returns {number} Count of projected block child entities
 */
export function projectBlockInstance(insertEntity, document, options = {}, projectChildCallback) {
  if (!insertEntity || !document || typeof projectChildCallback !== 'function') return 0;

  const blockName = insertEntity.attributes?.blockName;
  if (!blockName) return 0;

  const block = document.getBlock(blockName);
  if (!block || !Array.isArray(block.entities)) return 0;

  const depth = options.depth || 0;
  const maxDepth = options.maxBlockDepth || MAX_BLOCK_DEPTH;
  if (depth >= maxDepth) return 0;

  const activeStack = options.activeStack || new Set();
  const normalizedBlockKey = block.name.trim().toUpperCase();

  // Circular reference guard
  if (activeStack.has(normalizedBlockKey)) {
    return 0;
  }
  activeStack.add(normalizedBlockKey);

  // Extract transform parameters
  const localTransform = createInsertTransform(
    insertEntity.geometry?.point,
    insertEntity.geometry?.scale,
    insertEntity.geometry?.rotation
  );

  const parentTransform = options.parentTransform || null;
  const composedTransform = parentTransform
    ? composeTransforms(parentTransform, localTransform, block.basePoint)
    : localTransform;

  // Resolve parent INSERT style for inheritance
  const parentStyle = resolveEntityStyle(insertEntity, document, options.context);

  // Handle MINSERT (multiple insertions in a rectangular grid)
  const rowCount = Math.max(1, Number(insertEntity.attributes?.rowCount) || 1);
  const colCount = Math.max(1, Number(insertEntity.attributes?.columnCount) || 1);
  const rowSpacing = Number(insertEntity.attributes?.rowSpacing) || 0;
  const colSpacing = Number(insertEntity.attributes?.columnSpacing) || 0;

  let totalProjected = 0;

  const rootInsertHandle = options.rootInsertHandle || insertEntity.handle || 'INSERT';

  const effectiveInsertLayer = (insertEntity.layerId && insertEntity.layerId !== '0')
    ? insertEntity.layerId
    : (options.context?.parentLayer || insertEntity.layerId || '0');

  const hasExplicitColor = (insertEntity.style?.trueColor != null) ||
    (insertEntity.style?.colorIndex != null &&
     insertEntity.style.colorIndex !== 0 &&
     insertEntity.style.colorIndex !== 256);

  const effectiveInsertColor = hasExplicitColor
    ? parentStyle.color
    : (options.context?.parentColor != null ? options.context.parentColor : parentStyle.color);

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      let gridTransform = composedTransform;

      if (r > 0 || c > 0) {
        // Offset along grid axes rotated by rotation angle
        const offsetX = (c * colSpacing) * composedTransform.cos - (r * rowSpacing) * composedTransform.sin;
        const offsetY = (c * colSpacing) * composedTransform.sin + (r * rowSpacing) * composedTransform.cos;

        gridTransform = {
          ...composedTransform,
          translation: {
            x: composedTransform.translation.x + offsetX,
            y: composedTransform.translation.y + offsetY,
            z: composedTransform.translation.z,
          },
        };
      }

      const childContext = {
        parentLayer: effectiveInsertLayer,
        parentColor: effectiveInsertColor,
        parentLineType: parentStyle.lineType,
        parentLineWeight: parentStyle.lineWeight,
        visible: parentStyle.visible,
        inBlock: true,
        blockName: block.name,
        insertHandle: rootInsertHandle,
        depth: depth + 1,
      };

      for (const child of block.entities) {
        if (!child) continue;

        const childStyle = resolveEntityStyle(child, document, childContext);

        const blockContext = {
          rootInsertHandle,
          insertHandle: rootInsertHandle,
          immediateInsertHandle: insertEntity.handle || 'INSERT',
          blockName: block.name,
          childHandle: child.handle || null,
          childType: child.type || 'UNKNOWN',
          depth: depth + 1,
          basePoint: block.basePoint,
          activeStack: new Set(activeStack),
        };

        if (child.type === 'INSERT') {
          // Recursive nested INSERT
          totalProjected += projectBlockInstance(
            child,
            document,
            {
              ...options,
              rootInsertHandle,
              depth: depth + 1,
              parentTransform: gridTransform,
              context: childContext,
              activeStack: new Set(activeStack),
            },
            projectChildCallback
          );
        } else {
          projectChildCallback(child, childStyle, gridTransform, blockContext);
          totalProjected++;
        }
      }
    }
  }

  activeStack.delete(normalizedBlockKey);
  return totalProjected;
}
