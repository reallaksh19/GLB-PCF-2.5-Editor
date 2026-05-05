/*
 * core/geometry/vectors.js
 *
 * Simple 3-D vector utilities operating on plain {x, y, z} objects.
 */

export function clone(v)           { return { x: v.x, y: v.y, z: v.z }; }
export function add(v, d)          { return { x: v.x + d.x, y: v.y + d.y, z: v.z + d.z }; }
export function subtract(v, d)     { return { x: v.x - d.x, y: v.y - d.y, z: v.z - d.z }; }
export function multiplyScalar(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
export function length(v)          { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
export function normalize(v) {
  const len = length(v);
  return len === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / len, y: v.y / len, z: v.z / len };
}
export function dot(a, b)  { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
