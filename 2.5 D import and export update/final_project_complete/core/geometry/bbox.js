/*
 * core/geometry/bbox.js
 *
 * Placeholder for bounding box computations.  In Wave 1 bounding
 * boxes are not used by editing operations but the module is
 * reserved for future use.
 */

/**
 * Compute an axis‑aligned bounding box for a set of points.
 *
 * @param {Object[]} points Array of {x,y,z} points.
 * @returns {{min:{x,y,z}, max:{x,y,z}}} Bounding box.
 */
export function computeBoundingBox(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  return { min, max };
}