/*
 * core/geometry/vectors.js
 *
 * Simple vector utilities for 3D points represented as {x,y,z}.
 */

/**
 * Clone a vector.
 *
 * @param {Object} v Vector with x,y,z.
 * @returns {Object} New vector.
 */
export function clone(v) {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Add two vectors.
 *
 * @param {Object} v Base vector.
 * @param {Object} delta Vector to add.
 */
export function add(v, delta) {
  return { x: v.x + delta.x, y: v.y + delta.y, z: v.z + delta.z };
}

/**
 * Subtract two vectors (v - delta).
 */
export function subtract(v, delta) {
  return { x: v.x - delta.x, y: v.y - delta.y, z: v.z - delta.z };
}

/**
 * Multiply a vector by a scalar.
 */
export function multiplyScalar(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Compute the length of a vector.
 */
export function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Normalize a vector.  Returns a zero vector if input length is zero.
 */
export function normalize(v) {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Compute dot product of two vectors.
 */
export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Compute cross product of two vectors.
 */
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}