/*
 * formats/dxf/dxf-entity-normalizer.js
 *
 * DXF parser libraries and real-world drawings do not expose entity geometry
 * with one perfectly stable shape. This adapter normalizes the small set of
 * fields consumed by the renderer and CEG importer, and returns diagnostics
 * instead of allowing malformed/partial entities to throw during import.
 */

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function normalizeDxfPoint(value, fallback = null) {
  if (!value || typeof value !== 'object') return fallback;

  const x = finiteNumber(firstDefined(value.x, value.X, value[0]), null);
  const y = finiteNumber(firstDefined(value.y, value.Y, value[1]), null);
  const z = finiteNumber(firstDefined(value.z, value.Z, value[2]), 0);

  if (x === null || y === null) return fallback;
  return { x, y, z };
}

function normalizeVertices(ent) {
  const candidates = firstDefined(ent?.vertices, ent?.points, ent?.controlPoints, []);
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((pt) => normalizeDxfPoint(pt, null))
    .filter(Boolean);
}

function pointFromKeys(ent, keys, fallback = null) {
  for (const key of keys) {
    const pt = normalizeDxfPoint(ent?.[key], null);
    if (pt) return pt;
  }
  return fallback;
}

function scalarPoint(ent, xKeys, yKeys, zKeys = []) {
  const x = finiteNumber(firstDefined(...xKeys.map((key) => ent?.[key])), null);
  const y = finiteNumber(firstDefined(...yKeys.map((key) => ent?.[key])), null);
  const z = finiteNumber(firstDefined(...zKeys.map((key) => ent?.[key])), 0);
  if (x === null || y === null) return null;
  return { x, y, z };
}

function lineEndpoints(ent, vertices) {
  const fromVertex = vertices.length >= 2 ? { ep1: vertices[0], ep2: vertices[1] } : null;
  if (fromVertex) return fromVertex;

  const ep1 = pointFromKeys(ent, ['startPoint', 'start', 'p1', 'from']);
  const ep2 = pointFromKeys(ent, ['endPoint', 'end', 'p2', 'to']);
  if (ep1 && ep2) return { ep1, ep2 };

  const scalarEp1 = scalarPoint(ent, ['x1', 'startX'], ['y1', 'startY'], ['z1', 'startZ']);
  const scalarEp2 = scalarPoint(ent, ['x2', 'endX'], ['y2', 'endY'], ['z2', 'endZ']);
  if (scalarEp1 && scalarEp2) return { ep1: scalarEp1, ep2: scalarEp2 };

  return { ep1: null, ep2: null };
}

function centerPoint(ent) {
  return pointFromKeys(ent, ['center', 'centre', 'centerPoint', 'cp'])
    || scalarPoint(ent, ['cx', 'centerX'], ['cy', 'centerY'], ['cz', 'centerZ']);
}

function insertionPoint(ent) {
  return pointFromKeys(ent, ['position', 'insert', 'insertionPoint', 'basePoint', 'origin', 'startPoint'])
    || scalarPoint(ent, ['x'], ['y'], ['z']);
}

function textPoint(ent) {
  return pointFromKeys(ent, ['startPoint', 'position', 'insert', 'insertionPoint', 'origin'])
    || scalarPoint(ent, ['x'], ['y'], ['z'])
    || { x: 0, y: 0, z: 0 };
}

export function normalizeDxfEntity(ent, index = 0) {
  const rawType = String(ent?.type || 'UNKNOWN').toUpperCase();
  const vertices = normalizeVertices(ent);
  const { ep1, ep2 } = lineEndpoints(ent || {}, vertices);
  const center = centerPoint(ent || {});
  const position = insertionPoint(ent || {});
  const textAnchor = textPoint(ent || {});
  const radius = finiteNumber(ent?.radius, null);
  const startAngle = finiteNumber(firstDefined(ent?.startAngle, ent?.start_angle), 0);
  const endAngle = finiteNumber(firstDefined(ent?.endAngle, ent?.end_angle), 0);

  return {
    type: rawType,
    handle: ent?.handle || ent?.id || null,
    index,
    layer: ent?.layer || '0',
    colorIndex: finiteNumber(firstDefined(ent?.colorIndex, ent?.color, ent?.aci), 256),
    vertices,
    ep1,
    ep2,
    center,
    position,
    textAnchor,
    radius,
    startAngle,
    endAngle,
    text: String(firstDefined(ent?.text, ent?.plainText, ent?.string, '') || ''),
    blockName: firstDefined(ent?.name, ent?.blockName, ent?.block, null),
    raw: ent || {},
  };
}

export function getDxfEntityIssue(normalized) {
  const type = normalized?.type || 'UNKNOWN';
  if (type === 'LINE' && (!normalized.ep1 || !normalized.ep2)) {
    return 'LINE_MISSING_ENDPOINTS';
  }
  if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && normalized.vertices.length < 2) {
    return 'POLYLINE_NEEDS_AT_LEAST_TWO_VERTICES';
  }
  if ((type === 'ARC' || type === 'CIRCLE') && !normalized.center) {
    return `${type}_MISSING_CENTER`;
  }
  if ((type === 'ARC' || type === 'CIRCLE') && !(normalized.radius > 0)) {
    return `${type}_INVALID_RADIUS`;
  }
  if (type === 'INSERT' && !normalized.position) {
    return 'INSERT_MISSING_POSITION';
  }
  return null;
}

export function dxfEntitySource(normalized) {
  return {
    type: normalized?.type || 'UNKNOWN',
    handle: normalized?.handle || null,
    layer: normalized?.layer || '0',
    index: normalized?.index ?? null,
  };
}
