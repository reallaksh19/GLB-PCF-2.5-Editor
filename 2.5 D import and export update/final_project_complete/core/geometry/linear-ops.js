/*
 * core/geometry/linear-ops.js
 *
 * Geometry operations for linear entities (pipes, lines).  These
 * helpers operate on anchors and do not mutate the original CEG.
 */

import { subtract, length as vectorLength, normalize, add, multiplyScalar } from './vectors.js';

/**
 * Compute the length of a linear component given its two anchors.
 *
 * @param {Object} a Anchor point {x,y,z}.
 * @param {Object} b Anchor point {x,y,z}.
 * @returns {number} Distance between a and b.
 */
export function linearLength(a, b) {
  return vectorLength(subtract(b, a));
}

/**
 * Compute the new position of the moving anchor when extending a
 * linear component to a new length.  The direction is determined
 * from the fixed anchor to the moving anchor.
 *
 * @param {Object} fixed The fixed anchor {x,y,z}.
 * @param {Object} moving The moving anchor {x,y,z}.
 * @param {number} newLength The desired absolute length (>0).
 * @returns {Object} The new moving anchor position.
 */
export function extendLinear(fixed, moving, newLength) {
  const dir = subtract(moving, fixed);
  const unit = normalize(dir);
  const scaled = multiplyScalar(unit, newLength);
  return add(fixed, scaled);
}