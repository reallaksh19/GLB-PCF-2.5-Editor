/*
 * core/ceg/canonical-anchor.js
 *
 * Factory for anchor records within a Canonical Edit Graph.
 * Anchors are 3-D points (x, y, z) that components reference by ID.
 * They carry a role (EP1, EP2, CP, ORIGIN), optional topology links
 * via connectedTo, and a locked flag to prevent movement.
 */

/**
 * Create a canonical anchor.  Coordinates default to zero.
 *
 * @param {Object} input Fields describing the anchor.
 * @returns {Object} Anchor record.
 */
export function createAnchor(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('createAnchor requires an input object');
  }
  return {
    id:          input.id,
    role:        input.role,
    point: {
      x: Number(input.point?.x ?? 0),
      y: Number(input.point?.y ?? 0),
      z: Number(input.point?.z ?? 0)
    },
    connectedTo: Array.isArray(input.connectedTo) ? input.connectedTo.slice() : [],
    locked:      Boolean(input.locked),
    sourceRef:   input.sourceRef || null
  };
}
