/*
 * formats/dxf/dxf-bulge-utils.js
 *
 * DXF LWPOLYLINE/POLYLINE bulge support.
 * A bulge is tan(includedAngle / 4) and belongs to the segment starting at
 * the vertex that carries the bulge value. Positive bulge means the arc lies
 * to the left of the start->end chord in DXF XY space.
 */

const EPS = 1e-12;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isSamePoint(a, b, eps = 1e-9) {
  if (!a || !b) return false;
  return Math.abs((a.x ?? 0) - (b.x ?? 0)) <= eps
    && Math.abs((a.y ?? 0) - (b.y ?? 0)) <= eps
    && Math.abs((a.z ?? 0) - (b.z ?? 0)) <= eps;
}

function chordLength(a, b) {
  const dx = finiteNumber(b?.x) - finiteNumber(a?.x);
  const dy = finiteNumber(b?.y) - finiteNumber(a?.y);
  const dz = finiteNumber(b?.z) - finiteNumber(a?.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function hasBulge(vertex) {
  return Math.abs(finiteNumber(vertex?.bulge, 0)) > EPS;
}

export function bulgeToArc(ep1, ep2, bulge) {
  const b = finiteNumber(bulge, 0);
  if (!ep1 || !ep2 || Math.abs(b) <= EPS) return null;

  const x1 = finiteNumber(ep1.x);
  const y1 = finiteNumber(ep1.y);
  const z1 = finiteNumber(ep1.z);
  const x2 = finiteNumber(ep2.x);
  const y2 = finiteNumber(ep2.y);
  const z2 = finiteNumber(ep2.z);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord <= EPS) return null;

  const includedAngle = 4 * Math.atan(b);
  const radius = Math.abs(chord / (2 * Math.sin(includedAngle / 2)));
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: (z1 + z2) / 2 };

  // Center offset from chord midpoint. The sign is carried by b.
  const offset = chord * (1 - b * b) / (4 * b);
  const nx = -dy / chord;
  const ny = dx / chord;
  const center = {
    x: mid.x + nx * offset,
    y: mid.y + ny * offset,
    z: mid.z,
  };

  const startAngle = Math.atan2(y1 - center.y, x1 - center.x);
  const endAngle = Math.atan2(y2 - center.y, x2 - center.x);

  return {
    kind: 'ARC',
    ep1: { x: x1, y: y1, z: z1 },
    ep2: { x: x2, y: y2, z: z2 },
    cp: center,
    radius,
    bulge: b,
    includedAngle,
    startAngle,
    endAngle,
    clockwise: b < 0,
  };
}

export function isZeroLengthSegment(ep1, ep2, eps = 1e-9) {
  return chordLength(ep1, ep2) <= eps;
}

export function expandPolylineSegments(polyline = {}) {
  const sourceVertices = Array.isArray(polyline.vertices) ? polyline.vertices.filter(Boolean) : [];
  if (sourceVertices.length < 2) return [];

  const vertices = [...sourceVertices];
  const closed = Boolean(polyline.closed || polyline.shape || polyline.isClosed || polyline.raw?.closed || polyline.raw?.shape || polyline.raw?.isClosed);
  if (closed && vertices.length > 2 && !isSamePoint(vertices[0], vertices[vertices.length - 1])) {
    vertices.push(vertices[0]);
  }

  const segments = [];
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const ep1 = vertices[i];
    const ep2 = vertices[i + 1];
    if (isZeroLengthSegment(ep1, ep2)) continue;

    const bulge = finiteNumber(ep1?.bulge, 0);
    const arc = bulgeToArc(ep1, ep2, bulge);
    if (arc) {
      segments.push({
        ...arc,
        segmentIndex: i,
        downgradedFrom: polyline.type || 'POLYLINE',
      });
    } else {
      segments.push({
        kind: 'LINE',
        ep1: { x: finiteNumber(ep1.x), y: finiteNumber(ep1.y), z: finiteNumber(ep1.z) },
        ep2: { x: finiteNumber(ep2.x), y: finiteNumber(ep2.y), z: finiteNumber(ep2.z) },
        bulge: 0,
        segmentIndex: i,
        downgradedFrom: polyline.type || 'POLYLINE',
      });
    }
  }
  return segments;
}
