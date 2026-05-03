/*
 * core/ceg/canonical-anchor.js
 *
 * Defines the structure of an anchor within a Canonical Edit Graph.
 * Anchors represent points in 3D space that components reference by
 * ID.  They may have a role (e.g. EP1, EP2, ORIGIN) and a
 * connectedTo array describing topology relationships.
 */

/**
 * Create a canonical anchor.  Coordinates are always numeric and
 * default to zero.  Locks prevent anchors from being moved by
 * commands.
 *
 * @param {Object} input Input fields describing the anchor.
 * @returns {Object} An anchor record.
 */
export function createAnchor(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('createAnchor requires an input object');
  }
  return {
    id: input.id,
    role: input.role,
    point: {
      x: Number(input.point?.x ?? 0),
      y: Number(input.point?.y ?? 0),
      z: Number(input.point?.z ?? 0)
    },
    connectedTo: Array.isArray(input.connectedTo) ? input.connectedTo.slice() : [],
    locked: Boolean(input.locked),
    sourceRef: input.sourceRef || null
  };
}