/*
 * core/geometry/linear-ops.js
 *
 * Geometry operations for linear entities (pipes, lines).
 */

import { subtract, length as vectorLength, normalize, add, multiplyScalar } from './vectors.js';

/**
 * Euclidean distance between two anchor points.
 *
 * @param {Object} a {x, y, z}
 * @param {Object} b {x, y, z}
 * @returns {number}
 */
export function linearLength(a, b) {
  return vectorLength(subtract(b, a));
}

/**
 * Compute the new position of the moving anchor when extending a
 * linear component to a given absolute length.
 *
 * @param {Object} fixed   Fixed anchor point.
 * @param {Object} moving  Current position of the moving anchor.
 * @param {number} newLength  Target length (must be > 0).
 * @returns {Object} New position for the moving anchor.
 */
export function extendLinear(fixed, moving, newLength) {
  const dir    = subtract(moving, fixed);
  const unit   = normalize(dir);
  const scaled = multiplyScalar(unit, newLength);
  return add(fixed, scaled);
}
