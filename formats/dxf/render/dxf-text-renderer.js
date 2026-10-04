/**
 * formats/dxf/render/dxf-text-renderer.js
 *
 * Text and MText projection for CAD drawings.
 * Resolves insertion/alignment positions, cleans MTEXT formatting codes,
 * and computes oriented bounding boxes and styling for text display.
 */

/**
 * Clean AutoCAD MTEXT formatting codes and special character escapes.
 * Converts \P to newline, %%d to °, %%p to ±, %%c to Ø.
 * Strips font, color, height, and group wrappers.
 *
 * @param {string} rawText
 * @returns {string} Clean plain text
 */
export function cleanMText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Convert AutoCAD special escape characters
  text = text.replace(/%%d/gi, '°');
  text = text.replace(/%%p/gi, '±');
  text = text.replace(/%%c/gi, 'Ø');
  text = text.replace(/%%u/gi, ''); // underline toggle
  text = text.replace(/%%o/gi, ''); // overline toggle
  text = text.replace(/%%%/g, '%');

  // 2. Convert paragraph breaks \P to newlines
  text = text.replace(/\\P/g, '\n');

  // 3. Strip stacked fractions \S1/2; or \S1#2; -> 1/2 or 1#2
  text = text.replace(/\\S([^;]+);/g, '$1');

  // 4. Strip inline formatting tags:
  //    \f...; (font)
  //    \C...; (color)
  //    \H...; or \H...x; (height)
  //    \W...; (width)
  //    \Q...; (oblique angle)
  //    \A...; (alignment)
  //    \T...; (tracking)
  //    \O or \o (overline)
  //    \L or \l (underline)
  //    \K or \k (strike)
  text = text.replace(/\\[fF][^;]*;/g, '');
  text = text.replace(/\\[cChHwWqQaAtT][^;]*;/g, '');
  text = text.replace(/\\[oOlLkK]/g, '');

  // 5. Remove curly brace group blocks: { ... }
  // Repeat to handle nested groups
  let prev;
  do {
    prev = text;
    text = text.replace(/\{([^{}]*)\}/g, '$1');
  } while (text !== prev);

  // 6. Unescape backslashes and braces: \\ -> \, \{ -> {, \} -> }
  text = text.replace(/\\\\/g, '\\');
  text = text.replace(/\\\{/g, '{');
  text = text.replace(/\\\}/g, '}');

  return text.trim();
}

/**
 * Map horizontal and vertical justification codes for standard TEXT entities.
 * Group 72: 0=Left, 1=Center, 2=Right, 3=Aligned, 4=Middle, 5=Fit
 * Group 73: 0=Baseline, 1=Bottom, 2=Middle, 3=Top
 */
const H_ALIGN_MAP = ['LEFT', 'CENTER', 'RIGHT', 'ALIGNED', 'MIDDLE', 'FIT'];
const V_ALIGN_MAP = ['BASELINE', 'BOTTOM', 'MIDDLE', 'TOP'];

/**
 * Attachment points for MTEXT (group 71).
 */
const ATTACHMENT_MAP = {
  1: { h: 'LEFT', v: 'TOP' },
  2: { h: 'CENTER', v: 'TOP' },
  3: { h: 'RIGHT', v: 'TOP' },
  4: { h: 'LEFT', v: 'MIDDLE' },
  5: { h: 'CENTER', v: 'MIDDLE' },
  6: { h: 'RIGHT', v: 'MIDDLE' },
  7: { h: 'LEFT', v: 'BOTTOM' },
  8: { h: 'CENTER', v: 'BOTTOM' },
  9: { h: 'RIGHT', v: 'BOTTOM' },
};

/**
 * Resolve effective anchor position, alignment, and orientation for a TEXT or MTEXT entity.
 *
 * @param {import('../model/dxf-entity.js').DxfEntity} entity
 * @returns {Object}
 */
export function resolveTextGeometry(entity) {
  const isMText = entity.type === 'MTEXT';
  const geom = entity.geometry || {};
  const attrs = entity.attributes || {};

  let position = { x: geom.point?.x ?? 0, y: geom.point?.y ?? 0, z: geom.point?.z ?? 0 };
  let alignmentPoint = geom.alignmentPoint ? { ...geom.alignmentPoint } : null;

  let hAlign = 'LEFT';
  let vAlign = 'BASELINE';
  let attachmentPoint = null;

  let rotationDeg = Number(geom.rotation) || 0;

  if (isMText) {
    attachmentPoint = Number(attrs.attachmentPoint) || 1;
    const mapped = ATTACHMENT_MAP[attachmentPoint] || { h: 'LEFT', v: 'TOP' };
    hAlign = mapped.h;
    vAlign = mapped.v;

    // Check if direction vector is provided (codes 11, 21, 31)
    if (geom.directionVector && (geom.directionVector.x !== 0 || geom.directionVector.y !== 0)) {
      rotationDeg = (Math.atan2(geom.directionVector.y, geom.directionVector.x) * 180) / Math.PI;
    }
  } else {
    // Standard TEXT
    const hCode = Number(attrs.hAlign) || 0;
    const vCode = Number(attrs.vAlign) || 0;
    hAlign = H_ALIGN_MAP[hCode] || 'LEFT';
    vAlign = V_ALIGN_MAP[vCode] || 'BASELINE';

    // DXF spec rule: if hAlign > 0 or vAlign > 0, alignmentPoint is authoritative
    if ((hCode > 0 || vCode > 0) && alignmentPoint) {
      position = { ...alignmentPoint };
    }
  }

  const height = Math.max(0.001, Number(geom.height) || 2.5);
  const widthFactor = Number.isFinite(Number(geom.widthFactor)) ? Number(geom.widthFactor) : 1.0;
  const obliqueAngle = Number(geom.obliqueAngle) || 0;
  const rotationRad = (rotationDeg * Math.PI) / 180;

  return {
    position,
    alignmentPoint,
    hAlign,
    vAlign,
    attachmentPoint,
    height,
    widthFactor,
    obliqueAngle,
    rotationDeg,
    rotationRad,
  };
}

/**
 * Estimate the oriented 2D/3D bounding box for text lines.
 *
 * @param {string[]} lines
 * @param {Object} geomInfo - from resolveTextGeometry
 * @returns {{min: {x,y,z}, max: {x,y,z}, corners: Array<{x,y,z}>}}
 */
export function estimateTextBounds(lines, geomInfo) {
  const lineCount = Math.max(1, lines.length);
  const maxLineLen = lines.reduce((max, l) => Math.max(max, l.length), 0);

  // Approximate character dimensions (average aspect ratio ~0.65)
  const charWidth = geomInfo.height * geomInfo.widthFactor * 0.65;
  const totalWidth = Math.max(geomInfo.height, maxLineLen * charWidth);
  const totalHeight = lineCount * geomInfo.height * 1.25;

  // Horizontal offset from anchor
  let dx = 0;
  if (geomInfo.hAlign === 'CENTER' || geomInfo.hAlign === 'MIDDLE') {
    dx = -totalWidth / 2;
  } else if (geomInfo.hAlign === 'RIGHT') {
    dx = -totalWidth;
  }

  // Vertical offset from anchor
  let dy = 0;
  if (geomInfo.vAlign === 'TOP') {
    dy = -totalHeight;
  } else if (geomInfo.vAlign === 'MIDDLE') {
    dy = -totalHeight / 2;
  } else if (geomInfo.vAlign === 'BASELINE') {
    dy = -geomInfo.height * 0.2;
  }

  const cos = Math.cos(geomInfo.rotationRad);
  const sin = Math.sin(geomInfo.rotationRad);
  const px = geomInfo.position.x;
  const py = geomInfo.position.y;
  const pz = geomInfo.position.z;

  // 4 corners in local rotated plane
  const cornersLocal = [
    { x: dx, y: dy },
    { x: dx + totalWidth, y: dy },
    { x: dx + totalWidth, y: dy + totalHeight },
    { x: dx, y: dy + totalHeight },
  ];

  let minX = Infinity, minY = Infinity, minZ = pz;
  let maxX = -Infinity, maxY = -Infinity, maxZ = pz;

  const corners = cornersLocal.map((c) => {
    const rx = c.x * cos - c.y * sin + px;
    const ry = c.x * sin + c.y * cos + py;
    const rz = pz;

    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);

    return { x: rx, y: ry, z: rz };
  });

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    corners,
    width: totalWidth,
    height: totalHeight,
  };
}

/**
 * Project a TEXT or MTEXT entity into a RenderPrimitive text object.
 *
 * @param {import('../model/dxf-entity.js').DxfEntity} entity
 * @param {Object} resolvedStyle
 * @param {Object} [transform] - Optional block transform
 * @param {Object} [blockContext] - Optional block context
 * @returns {Object} Render primitive
 */
export function projectTextPrimitive(entity, resolvedStyle, transform, blockContext) {
  const geomInfo = resolveTextGeometry(entity);
  const rawString = entity.attributes?.rawText || entity.attributes?.text || '';
  const cleanString = cleanMText(rawString);
  const lines = cleanString.split('\n');

  // Compute bounding box
  const bounds = estimateTextBounds(lines, geomInfo);

  // If transform is provided (e.g. inside an INSERT block instance), transform position and rotation
  let effectivePosition = geomInfo.position;
  let effectiveRotation = geomInfo.rotationDeg;
  let effectiveRotationRad = geomInfo.rotationRad;

  if (transform) {
    const cos = transform.cos;
    const sin = transform.sin;
    const lx = (geomInfo.position.x - (blockContext?.basePoint?.x || 0)) * transform.scale.x;
    const ly = (geomInfo.position.y - (blockContext?.basePoint?.y || 0)) * transform.scale.y;
    const lz = (geomInfo.position.z - (blockContext?.basePoint?.z || 0)) * transform.scale.z;

    effectivePosition = {
      x: transform.translation.x + lx * cos - ly * sin,
      y: transform.translation.y + lx * sin + ly * cos,
      z: transform.translation.z + lz,
    };

    effectiveRotationRad += transform.rotationRad;
    effectiveRotation = (effectiveRotationRad * 180) / Math.PI;
  }

  // Stable selection target: if inside a block, defaults to the INSERT handle
  const sourceEntityId = blockContext
    ? `dxf:entity:${blockContext.insertHandle}`
    : `dxf:entity:${entity.handle || 'TEXT'}`;

  return {
    type: 'text',
    id: `render:${entity.handle || 'text'}:${blockContext ? blockContext.depth : 0}`,
    sourceEntityId,
    layer: resolvedStyle.layerName,
    style: resolvedStyle,
    text: cleanString,
    rawText: rawString,
    lines,
    position: effectivePosition,
    alignmentPoint: geomInfo.alignmentPoint,
    height: geomInfo.height * (transform ? Math.abs(transform.scale.y) : 1.0),
    rotation: effectiveRotation,
    rotationRad: effectiveRotationRad,
    widthFactor: geomInfo.widthFactor,
    obliqueAngle: geomInfo.obliqueAngle,
    hAlign: geomInfo.hAlign,
    vAlign: geomInfo.vAlign,
    attachmentPoint: geomInfo.attachmentPoint,
    styleName: entity.attributes?.styleName || 'STANDARD',
    bounds,
    blockContext: blockContext || null,
  };
}
