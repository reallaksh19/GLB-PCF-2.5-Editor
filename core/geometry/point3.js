/*
 * core/geometry/point3.js
 *
 * Deterministic engineering-coordinate helpers.
 * Coordinates are always model-space millimetres: { x, y, z }.
 */

export const POINT3_VERSION = '1.0.0-m0';
export const POINT3_EPS = 1e-6;

export function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function point3(input = {}, fallback = { x: 0, y: 0, z: 0 }) {
  if (Array.isArray(input)) {
    return {
      x: finiteNumber(input[0], fallback.x ?? 0),
      y: finiteNumber(input[1], fallback.y ?? 0),
      z: finiteNumber(input[2], fallback.z ?? 0),
    };
  }
  if (!input || typeof input !== 'object') return point3(fallback);
  return {
    x: finiteNumber(input.x, fallback.x ?? 0),
    y: finiteNumber(input.y, fallback.y ?? 0),
    z: finiteNumber(input.z, fallback.z ?? 0),
  };
}

export function clonePoint3(input) {
  return point3(input);
}

export function addPoint3(a, b) {
  const aa = point3(a);
  const bb = point3(b);
  return { x: aa.x + bb.x, y: aa.y + bb.y, z: aa.z + bb.z };
}

export function subtractPoint3(a, b) {
  const aa = point3(a);
  const bb = point3(b);
  return { x: aa.x - bb.x, y: aa.y - bb.y, z: aa.z - bb.z };
}

export function scalePoint3(a, factor = 1) {
  const aa = point3(a);
  const f = finiteNumber(factor, 1);
  return { x: aa.x * f, y: aa.y * f, z: aa.z * f };
}

export function distancePoint3(a, b) {
  const d = subtractPoint3(a, b);
  return Math.hypot(d.x, d.y, d.z);
}

export function pointsEqual3(a, b, eps = POINT3_EPS) {
  return distancePoint3(a, b) <= finiteNumber(eps, POINT3_EPS);
}

export function midpoint3(a, b) {
  return scalePoint3(addPoint3(a, b), 0.5);
}

export function deltaToPoint3(from, to) {
  const d = subtractPoint3(to, from);
  return { dx: d.x, dy: d.y, dz: d.z };
}

export function applyDelta3(from, delta = {}) {
  const p = point3(from);
  return {
    x: p.x + finiteNumber(delta.dx),
    y: p.y + finiteNumber(delta.dy),
    z: p.z + finiteNumber(delta.dz),
  };
}

export function isZeroLength3(a, b, eps = POINT3_EPS) {
  return distancePoint3(a, b) <= finiteNumber(eps, POINT3_EPS);
}
