/*
 * formats/dxf/dxf-curve-utils.js
 *
 * Curve expansion helpers for DXF visual fidelity. The active renderer still
 * consumes straight ep1/ep2 segments, so curved DXF entities are approximated
 * into deterministic chord segments with source metadata. This is intentionally
 * separate from topology semantics: it improves AutoCAD-like visual fidelity
 * without pretending that every chord is a piping design segment.
 */

const DEFAULT_CURVE_TOLERANCE_MM = 25;
const DEFAULT_MAX_SEGMENT_LENGTH_MM = 500;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dist2d(a, b) {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  return Math.hypot(dx, dy);
}

function dist3d(a, b) {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const dz = (b.z ?? 0) - (a.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

function isZeroLength(a, b) {
  return !a || !b || dist3d(a, b) < 1e-9;
}

export function hasPolylineBulges(vertices = []) {
  return (vertices || []).some((v) => Math.abs(finiteNumber(v?.bulge, 0)) > 1e-12);
}

function segmentCountForArc(radius, sweepAbs, options = {}) {
  const maxLen = Math.max(finiteNumber(options.maxSegmentLengthMm, DEFAULT_MAX_SEGMENT_LENGTH_MM), 1);
  const tolerance = Math.max(finiteNumber(options.toleranceMm, DEFAULT_CURVE_TOLERANCE_MM), 0.001);
  const arcLenCount = Math.ceil((radius * sweepAbs) / maxLen);
  const tolAngle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / Math.max(radius, tolerance))));
  const tolCount = Number.isFinite(tolAngle) && tolAngle > 0 ? Math.ceil(sweepAbs / tolAngle) : 1;
  return Math.max(2, arcLenCount, tolCount);
}

function bulgeToPoints(start, end, bulge, options = {}) {
  const b = finiteNumber(bulge, 0);
  if (Math.abs(b) < 1e-12 || isZeroLength(start, end)) return [start, end];

  const chord = dist2d(start, end);
  if (chord < 1e-9) return [start, end];

  const theta = 4 * Math.atan(b);
  const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
  if (!Number.isFinite(radius) || radius < 1e-9) return [start, end];

  const dx = (end.x - start.x) / chord;
  const dy = (end.y - start.y) / chord;
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    z: ((start.z ?? 0) + (end.z ?? 0)) / 2,
  };
  const d = chord * (1 - b * b) / (4 * b);
  const center = {
    x: mid.x + (-dy) * d,
    y: mid.y + dx * d,
    z: mid.z,
  };

  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const count = segmentCountForArc(radius, Math.abs(theta), options);
  const pts = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const a = startAngle + theta * t;
    pts.push({
      x: center.x + radius * Math.cos(a),
      y: center.y + radius * Math.sin(a),
      z: (start.z ?? 0) + ((end.z ?? 0) - (start.z ?? 0)) * t,
    });
  }
  // Keep exact parser endpoints to avoid tiny floating point drift in topology.
  pts[0] = { ...start };
  pts[pts.length - 1] = { ...end };
  return pts;
}

export function expandPolylineToSegments(polyline, options = {}) {
  const sourceVertices = Array.isArray(polyline?.vertices) ? polyline.vertices : [];
  const vertices = sourceVertices.map((v) => ({
    x: finiteNumber(v.x),
    y: finiteNumber(v.y),
    z: finiteNumber(v.z, 0),
    bulge: finiteNumber(v.bulge, 0),
  }));
  const closed = Boolean(polyline?.closed || polyline?.shape || polyline?.isClosed || polyline?.raw?.closed || polyline?.raw?.shape || polyline?.raw?.isClosed);
  if (closed && vertices.length > 2) vertices.push({ ...vertices[0], bulge: vertices[vertices.length - 1]?.bulge ?? 0 });

  const segments = [];
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const ep1 = vertices[i];
    const ep2 = vertices[i + 1];
    if (isZeroLength(ep1, ep2)) continue;
    const bulge = finiteNumber(ep1.bulge, 0);
    const points = bulgeToPoints(ep1, ep2, bulge, options);
    for (let j = 0; j < points.length - 1; j += 1) {
      if (isZeroLength(points[j], points[j + 1])) continue;
      segments.push({
        ep1: points[j],
        ep2: points[j + 1],
        segmentIndex: i,
        chordIndex: j,
        approximatedFrom: Math.abs(bulge) > 1e-12 ? 'BULGE_ARC' : null,
        bulge,
      });
    }
  }
  return segments;
}

// Catmull-Rom spline sampling. This is a visual-fidelity fallback for DXF
// SPLINE entities when the parser exposes only control/fit points.
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3),
    z: 0.5 * ((2 * (p1.z ?? 0)) + (-(p0.z ?? 0) + (p2.z ?? 0)) * t + (2*(p0.z ?? 0) - 5*(p1.z ?? 0) + 4*(p2.z ?? 0) - (p3.z ?? 0)) * t2 + (-(p0.z ?? 0) + 3*(p1.z ?? 0) - 3*(p2.z ?? 0) + (p3.z ?? 0)) * t3),
  };
}

export function expandSplineToSegments(spline, options = {}) {
  const points = (spline?.vertices || []).map((v) => ({ x: finiteNumber(v.x), y: finiteNumber(v.y), z: finiteNumber(v.z, 0) }));
  if (points.length < 2) return [];
  if (points.length === 2) return isZeroLength(points[0], points[1]) ? [] : [{ ep1: points[0], ep2: points[1], segmentIndex: 0, chordIndex: 0, approximatedFrom: 'SPLINE_CHORD' }];

  const maxLen = Math.max(finiteNumber(options.maxSegmentLengthMm, DEFAULT_MAX_SEGMENT_LENGTH_MM), 1);
  const sampled = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const chord = dist3d(p1, p2);
    const steps = Math.max(2, Math.ceil(chord / maxLen), 8);
    for (let j = 0; j <= steps; j += 1) {
      if (i > 0 && j === 0) continue;
      sampled.push(catmullRom(p0, p1, p2, p3, j / steps));
    }
  }

  const segments = [];
  for (let i = 0; i < sampled.length - 1; i += 1) {
    if (isZeroLength(sampled[i], sampled[i + 1])) continue;
    segments.push({ ep1: sampled[i], ep2: sampled[i + 1], segmentIndex: i, chordIndex: i, approximatedFrom: 'SPLINE_SAMPLE' });
  }
  return segments;
}

export function expandCurveEntityToSegments(entity, options = {}) {
  if (!entity) return [];
  if (entity.type === 'SPLINE') return expandSplineToSegments(entity, options);
  return expandPolylineToSegments(entity, options);
}
