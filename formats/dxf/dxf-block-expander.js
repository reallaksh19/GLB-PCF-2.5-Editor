/*
 * formats/dxf/dxf-block-expander.js
 *
 * DXF-FID-04: expand block INSERTs into transformed model-space entities.
 * This module is intentionally format-local. It does not decide piping
 * semantics; it only makes AutoCAD block geometry visible to the CEG mapper.
 */

import {
  addArc,
  addCircle,
  addDiagnostic,
  addGuide,
  addLine,
  addPolyline,
  addText,
  findBlockDefinition,
} from './dxf-raw-model.js';
import { normalizeDxfEntity } from './dxf-entity-normalizer.js';

const MAX_BLOCK_DEPTH = 8;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function degToRad(deg) {
  return finiteNumber(deg, 0) * Math.PI / 180;
}

function point(value, fallback = { x: 0, y: 0, z: 0 }) {
  if (!value || typeof value !== 'object') return { ...fallback };
  return {
    x: finiteNumber(value.x, fallback.x || 0),
    y: finiteNumber(value.y, fallback.y || 0),
    z: finiteNumber(value.z, fallback.z || 0),
    ...(value.bulge != null ? { bulge: finiteNumber(value.bulge, 0) } : {}),
  };
}

export function insertTransformFromEntity(insert = {}) {
  const sx = finiteNumber(insert.xScale ?? insert.scaleX ?? insert.scale?.x ?? insert.raw?.xScale ?? insert.raw?.scaleX, 1);
  const sy = finiteNumber(insert.yScale ?? insert.scaleY ?? insert.scale?.y ?? insert.raw?.yScale ?? insert.raw?.scaleY, 1);
  const sz = finiteNumber(insert.zScale ?? insert.scaleZ ?? insert.scale?.z ?? insert.raw?.zScale ?? insert.raw?.scaleZ, 1);
  return {
    insertion: point(insert.position || insert.insert || insert.insertionPoint || { x: insert.x, y: insert.y, z: insert.z }),
    scale: { x: sx || 1, y: sy || 1, z: sz || 1 },
    rotationRad: degToRad(insert.rotation ?? insert.rotationAngle ?? insert.raw?.rotation ?? insert.raw?.rotationAngle ?? 0),
  };
}

export function composeInsertTransform(parent, local) {
  const zero = { insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotationRad: 0 };
  const p = parent || zero;
  const l = local || zero;
  const transformedInsertion = transformPoint(l.insertion, p, { x: 0, y: 0, z: 0 });
  return {
    insertion: transformedInsertion,
    scale: {
      x: p.scale.x * l.scale.x,
      y: p.scale.y * l.scale.y,
      z: p.scale.z * l.scale.z,
    },
    rotationRad: p.rotationRad + l.rotationRad,
  };
}

export function transformPoint(pt, transform, basePoint = { x: 0, y: 0, z: 0 }) {
  const p = point(pt);
  const base = point(basePoint);
  const t = transform || insertTransformFromEntity({});
  const lx = (p.x - base.x) * t.scale.x;
  const ly = (p.y - base.y) * t.scale.y;
  const lz = (p.z - base.z) * t.scale.z;
  const cos = Math.cos(t.rotationRad);
  const sin = Math.sin(t.rotationRad);
  const x = t.insertion.x + lx * cos - ly * sin;
  const y = t.insertion.y + lx * sin + ly * cos;
  const z = t.insertion.z + lz;
  return {
    x,
    y,
    z,
    ...(pt?.bulge != null ? { bulge: finiteNumber(pt.bulge, 0) } : {}),
  };
}

function transformRadius(radius, transform) {
  const sx = Math.abs(transform?.scale?.x ?? 1);
  const sy = Math.abs(transform?.scale?.y ?? 1);
  const uniform = Math.abs(sx - sy) <= 1e-9;
  return {
    radius: finiteNumber(radius, 0) * ((sx + sy) / 2 || 1),
    nonUniform: !uniform,
  };
}

function inheritedLayer(parentLayer, entityLayer) {
  const layer = String(entityLayer || '0');
  return layer === '0' && parentLayer ? parentLayer : layer;
}

function sourceForInsert(parentInsert, blockName, child, depth) {
  return {
    format: 'DXF',
    expandedFromInsert: parentInsert?.handle || null,
    blockName,
    childHandle: child?.handle || null,
    childType: child?.type || 'UNKNOWN',
    depth,
  };
}

function addExpandedLine(model, child, transform, blockBase, parentInsert, blockName, depth) {
  addLine(model, {
    type: 'LINE',
    handle: `${parentInsert.handle || 'INSERT'}:${child.handle || 'LINE'}:${depth}`,
    layer: inheritedLayer(parentInsert.layer, child.layer),
    x1: transformPoint(child.ep1, transform, blockBase).x,
    y1: transformPoint(child.ep1, transform, blockBase).y,
    z1: transformPoint(child.ep1, transform, blockBase).z,
    x2: transformPoint(child.ep2, transform, blockBase).x,
    y2: transformPoint(child.ep2, transform, blockBase).y,
    z2: transformPoint(child.ep2, transform, blockBase).z,
    sourceRef: sourceForInsert(parentInsert, blockName, child, depth),
  });
}

function addExpandedArc(model, child, transform, blockBase, parentInsert, blockName, depth) {
  const center = transformPoint(child.center, transform, blockBase);
  const radiusInfo = transformRadius(child.radius, transform);
  const angleOffset = transform.rotationRad;
  addArc(model, {
    type: 'ARC',
    handle: `${parentInsert.handle || 'INSERT'}:${child.handle || 'ARC'}:${depth}`,
    layer: inheritedLayer(parentInsert.layer, child.layer),
    cx: center.x,
    cy: center.y,
    cz: center.z,
    radius: radiusInfo.radius,
    startAngle: finiteNumber(child.startAngle, 0) + angleOffset,
    endAngle: finiteNumber(child.endAngle, 0) + angleOffset,
    sourceRef: sourceForInsert(parentInsert, blockName, child, depth),
  });
  if (radiusInfo.nonUniform) {
    addDiagnostic(model, {
      severity: 'WARN',
      code: 'DXF_BLOCK_NON_UNIFORM_ARC_SCALE',
      handle: parentInsert.handle || null,
      blockName,
      childHandle: child.handle || null,
      message: 'Non-uniform block scaling on ARC/CIRCLE approximated using average XY scale.',
    });
  }
}

function addExpandedCircle(model, child, transform, blockBase, parentInsert, blockName, depth) {
  const center = transformPoint(child.center, transform, blockBase);
  const radiusInfo = transformRadius(child.radius, transform);
  addCircle(model, {
    type: 'CIRCLE',
    handle: `${parentInsert.handle || 'INSERT'}:${child.handle || 'CIRCLE'}:${depth}`,
    layer: inheritedLayer(parentInsert.layer, child.layer),
    cx: center.x,
    cy: center.y,
    cz: center.z,
    radius: radiusInfo.radius,
    sourceRef: sourceForInsert(parentInsert, blockName, child, depth),
  });
  if (radiusInfo.nonUniform) {
    addDiagnostic(model, {
      severity: 'WARN',
      code: 'DXF_BLOCK_NON_UNIFORM_CIRCLE_SCALE',
      handle: parentInsert.handle || null,
      blockName,
      childHandle: child.handle || null,
      message: 'Non-uniform block scaling on CIRCLE approximated as circle using average XY scale.',
    });
  }
}

function addExpandedPolyline(model, child, transform, blockBase, parentInsert, blockName, depth) {
  const vertices = (child.vertices || []).map((v) => transformPoint(v, transform, blockBase));
  addPolyline(model, {
    type: child.type || 'POLYLINE',
    handle: `${parentInsert.handle || 'INSERT'}:${child.handle || 'POLYLINE'}:${depth}`,
    layer: inheritedLayer(parentInsert.layer, child.layer),
    vertices,
    closed: Boolean(child.raw?.closed || child.raw?.shape || child.raw?.isClosed),
    sourceRef: sourceForInsert(parentInsert, blockName, child, depth),
  });
}

function addExpandedText(model, child, transform, blockBase, parentInsert, blockName, depth) {
  const textAnchor = transformPoint(child.textAnchor, transform, blockBase);
  addText(model, {
    type: child.type || 'TEXT',
    handle: `${parentInsert.handle || 'INSERT'}:${child.handle || 'TEXT'}:${depth}`,
    layer: inheritedLayer(parentInsert.layer, child.layer),
    x: textAnchor.x,
    y: textAnchor.y,
    z: textAnchor.z,
    text: child.text || '',
    sourceRef: sourceForInsert(parentInsert, blockName, child, depth),
  });
}

function addExpandedSplineGuide(model, child, transform, blockBase, parentInsert, blockName, depth) {
  const points = (child.vertices || []).map((v) => transformPoint(v, transform, blockBase));
  addGuide(model, {
    type: 'SPLINE',
    handle: `${parentInsert.handle || 'INSERT'}:${child.handle || 'SPLINE'}:${depth}`,
    layer: inheritedLayer(parentInsert.layer, child.layer),
    points,
    sourcePointType: child.raw?.fitPoints?.length ? 'FIT' : 'CONTROL',
    sourceRef: sourceForInsert(parentInsert, blockName, child, depth),
  });
}

function expandChildEntity(model, childRaw, transform, blockBase, parentInsert, blockName, depth, activeStack) {
  const child = normalizeDxfEntity(childRaw, 0);
  switch (child.type) {
    case 'LINE':
      if (child.ep1 && child.ep2) addExpandedLine(model, child, transform, blockBase, parentInsert, blockName, depth);
      break;
    case 'ARC':
      if (child.center && child.radius > 0) addExpandedArc(model, child, transform, blockBase, parentInsert, blockName, depth);
      break;
    case 'CIRCLE':
      if (child.center && child.radius > 0) addExpandedCircle(model, child, transform, blockBase, parentInsert, blockName, depth);
      break;
    case 'LWPOLYLINE':
    case 'POLYLINE':
      if (child.vertices.length >= 2) addExpandedPolyline(model, child, transform, blockBase, parentInsert, blockName, depth);
      break;
    case 'TEXT':
    case 'MTEXT':
      addExpandedText(model, child, transform, blockBase, parentInsert, blockName, depth);
      break;
    case 'SPLINE':
      if (child.vertices.length >= 2) addExpandedSplineGuide(model, child, transform, blockBase, parentInsert, blockName, depth);
      break;
    case 'INSERT': {
      const nestedTransform = composeInsertTransform(transform, insertTransformFromEntity(child.raw || child));
      expandInsert(model, child, nestedTransform, depth + 1, activeStack);
      break;
    }
    default:
      addDiagnostic(model, {
        severity: 'INFO',
        code: 'DXF_BLOCK_CHILD_UNSUPPORTED',
        handle: parentInsert.handle || null,
        blockName,
        childHandle: child.handle || null,
        childType: child.type,
        message: 'Block child entity is not expanded by the current fidelity pass.',
      });
      break;
  }
}

export function expandInsert(model, insert, transformOverride = null, depth = 0, activeStack = []) {
  const blockName = insert?.blockName || insert?.name || null;
  const block = findBlockDefinition(model, blockName);
  if (!block) {
    addDiagnostic(model, {
      severity: 'WARN',
      code: 'DXF_BLOCK_DEFINITION_MISSING',
      handle: insert?.handle || null,
      blockName,
      message: 'INSERT references a block definition that is not present in the parsed DXF blocks table.',
    });
    return { expanded: 0, missing: true };
  }

  const key = String(block.name || blockName).toUpperCase();
  if (activeStack.includes(key)) {
    addDiagnostic(model, {
      severity: 'ERROR',
      code: 'DXF_BLOCK_RECURSION',
      handle: insert?.handle || null,
      blockName,
      stack: [...activeStack, key],
      message: 'Recursive block INSERT expansion skipped.',
    });
    return { expanded: 0, recursion: true };
  }
  if (depth > MAX_BLOCK_DEPTH) {
    addDiagnostic(model, {
      severity: 'ERROR',
      code: 'DXF_BLOCK_MAX_DEPTH',
      handle: insert?.handle || null,
      blockName,
      depth,
      message: 'Nested block INSERT expansion exceeded maximum depth.',
    });
    return { expanded: 0, maxDepth: true };
  }

  const transform = transformOverride || insertTransformFromEntity(insert);
  const basePoint = point(block.basePoint);
  const before = model.lines.length + model.arcs.length + model.circles.length + model.polylines.length + model.texts.length + model.guides.length;
  const stack = [...activeStack, key];

  for (const childRaw of block.entities || []) {
    expandChildEntity(model, childRaw, transform, basePoint, insert, block.name || blockName, depth, stack);
  }

  const after = model.lines.length + model.arcs.length + model.circles.length + model.polylines.length + model.texts.length + model.guides.length;
  const expanded = after - before;
  model.blockExpansions.push({
    handle: insert?.handle || null,
    blockName: block.name || blockName,
    depth,
    expanded,
  });
  return { expanded };
}

export function expandAllInserts(model) {
  if (!model || typeof model !== 'object') {
    return {
      expanded: 0,
      missing: 0,
      insertCount: 0,
      skipped: true,
      reason: 'INVALID_MODEL',
    };
  }

  if (model.__blocksExpanded === true) {
    addDiagnostic?.(model, {
      severity: 'INFO',
      code: 'DXF_BLOCK_EXPANSION_ALREADY_DONE',
      message: 'Block expansion skipped because this raw DXF model was already expanded.',
    });
    return {
      expanded: 0,
      missing: 0,
      insertCount: model.inserts?.length || 0,
      skipped: true,
      reason: 'ALREADY_EXPANDED',
    };
  }

  let expanded = 0;
  let missing = 0;
  for (const insert of model.inserts || []) {
    const result = expandInsert(model, insert);
    expanded += result.expanded || 0;
    if (result.missing) missing += 1;
  }
  model.__blocksExpanded = true;
  return { expanded, missing, insertCount: model.inserts?.length || 0 };
}
