/**
 * formats/dxf/writer/entity-writers/writer-utils.js
 *
 * Formatting and common tag emission utilities for DXF entity writers.
 */

export function fmtNum(val, defaultVal = 0) {
  const n = Number(val ?? defaultVal);
  if (!Number.isFinite(n)) throw new Error('Invalid non-finite DXF numeric field');
  // Max 10 decimal places, strip trailing zeros
  const fixed = n.toFixed(10);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function pushTag(lines, code, value) {
  lines.push(String(code));
  lines.push(String(value ?? ''));
}

export function writeCommonEntityTags(entity, lines) {
  // 5 / 105: Handle
  if (entity.handle) {
    pushTag(lines, 5, entity.handle);
  }
  // 330: Owner handle
  if (entity.ownerHandle) {
    pushTag(lines, 330, entity.ownerHandle);
  }
  // 8: Layer name
  pushTag(lines, 8, entity.layerId || '0');

  // 67: Paper space flag (only emit if paper space)
  if (entity.space === 'paper') {
    pushTag(lines, 67, 1);
  }

  // 62: Color index (if explicit or BYBLOCK; BYLAYER is 256 and often omitted, but if specified we emit)
  if (entity.style) {
    if (entity.style.colorIndex != null && entity.style.colorIndex !== 256) {
      pushTag(lines, 62, entity.style.colorIndex);
    }
    // 420: 24-bit TrueColor
    if (entity.style.trueColor != null) {
      pushTag(lines, 420, entity.style.trueColor);
    }
    // 6: Linetype (if not BYLAYER)
    if (entity.style.lineType && entity.style.lineType !== 'BYLAYER') {
      pushTag(lines, 6, entity.style.lineType);
    }
    // 370: Lineweight
    if (entity.style.lineWeight != null && entity.style.lineWeight !== -1) {
      pushTag(lines, 370, entity.style.lineWeight);
    }
  }
}
