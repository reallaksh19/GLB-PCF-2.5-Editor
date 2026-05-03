/**
 * Snap-lite module.
 *
 * Provides simple snapping utilities. In a full implementation this
 * might enforce orthogonal, grid or object snapping. For now it
 * returns the input point unchanged.
 */

/**
 * Snap a point to the nearest valid location. This stub returns the
 * input point directly.
 *
 * @param {Object} point A point with x,y,z coordinates
 * @returns {Object} The snapped point
 */
export function snapPoint(point) {
  return { ...point };
}