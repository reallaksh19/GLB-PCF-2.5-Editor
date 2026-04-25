/**
 * editor/coordinate-normalizer.js
 * Canonical engineering-coordinate helpers for AI-2.
 *
 * Canonical model space is always engineering mm with fields {x,y,z}.
 * Renderer-facing conversion remains delegated to geometry/pipe-geometry.js::toThree().
 */

const EPS = 1e-6;

export const COORDINATE_CONTRACT_VERSION = '1.0.0-ai2';

export function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function normalizePoint(input = {}) {
  if (Array.isArray(input)) {
    return {
      x: toFiniteNumber(input[0]),
      y: toFiniteNumber(input[1]),
      z: toFiniteNumber(input[2]),
    };
  }
  return {
    x: toFiniteNumber(input.x),
    y: toFiniteNumber(input.y),
    z: toFiniteNumber(input.z),
  };
}

export function clonePoint(pt = {}) {
  return normalizePoint(pt);
}

export function pointsEqual(a, b, eps = EPS) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps
  );
}

export function deltaBetween(a, b) {
  const aa = normalizePoint(a);
  const bb = normalizePoint(b);
  return {
    dx: bb.x - aa.x,
    dy: bb.y - aa.y,
    dz: bb.z - aa.z,
  };
}

export function applyDelta(point, delta = {}) {
  const p = normalizePoint(point);
  return {
    x: p.x + toFiniteNumber(delta.dx),
    y: p.y + toFiniteNumber(delta.dy),
    z: p.z + toFiniteNumber(delta.dz),
  };
}

export function normalizeAxisDelta({ dx = 0, dy = 0, dz = 0 } = {}) {
  return {
    dx: toFiniteNumber(dx),
    dy: toFiniteNumber(dy),
    dz: toFiniteNumber(dz),
  };
}

export function boundsFromPoints(points = []) {
  if (!points.length) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
    };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const raw of points) {
    const p = normalizePoint(raw);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}
