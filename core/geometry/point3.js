/**
 * core/geometry/point3.js
 * Shared 3D point helpers for CEG geometry + drafting parsers.
 */

export const POINT3_EPSILON = 1e-6;

export function assertFinitePoint3(point, label) {
  const name = String(label || 'point');
  if (!point || typeof point !== 'object') {
    throw new TypeError(`${name} must be an object with x,y,z`);
  }
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new TypeError(`${name} must contain finite x,y,z numbers`);
  }
  return { x, y, z };
}

export function toPoint3(value) {
  return assertFinitePoint3(value, 'point');
}

export function clonePoint3(point) {
  const p = assertFinitePoint3(point, 'point');
  return { x: p.x, y: p.y, z: p.z };
}

export function addPoint3(a, b) {
  const p1 = assertFinitePoint3(a, 'a');
  const p2 = assertFinitePoint3(b, 'b');
  return { x: p1.x + p2.x, y: p1.y + p2.y, z: p1.z + p2.z };
}

export function subtractPoint3(a, b) {
  const p1 = assertFinitePoint3(a, 'a');
  const p2 = assertFinitePoint3(b, 'b');
  return { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
}

export function scalePoint3(point, factor) {
  const p = assertFinitePoint3(point, 'point');
  const f = Number(factor);
  if (!Number.isFinite(f)) throw new TypeError('factor must be a finite number');
  return { x: p.x * f, y: p.y * f, z: p.z * f };
}

export function midpointPoint3(a, b) {
  const p1 = assertFinitePoint3(a, 'a');
  const p2 = assertFinitePoint3(b, 'b');
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2,
  };
}

export function distancePoint3(a, b) {
  const p1 = assertFinitePoint3(a, 'a');
  const p2 = assertFinitePoint3(b, 'b');
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function pointsAlmostEqual(a, b, epsilon) {
  const eps = Number.isFinite(Number(epsilon)) ? Number(epsilon) : POINT3_EPSILON;
  const p1 = assertFinitePoint3(a, 'a');
  const p2 = assertFinitePoint3(b, 'b');
  return Math.abs(p1.x - p2.x) <= eps
    && Math.abs(p1.y - p2.y) <= eps
    && Math.abs(p1.z - p2.z) <= eps;
}
