/*
 * core/ceg/canonical-component.js
 *
 * Factory for component records within a Canonical Edit Graph.
 * Components represent discrete engineering objects (pipes, lines, valves,
 * flanges, proxy meshes).  Geometry is NOT stored inline — components
 * reference anchors by ID.
 */

import { defaultCapabilities } from './capabilities.js';

/**
 * Create a canonical component.  Unrecognised keys from input are
 * preserved to allow adapters to carry extra metadata through.
 *
 * @param {Object} input Fields describing the component.
 * @returns {Object} Component record.
 */
export function createComponent(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('createComponent requires an input object');
  }
  const component = {
    id:           input.id,
    type:         input.type,
    layerId:      input.layerId      || 'default',
    anchorIds:    Array.isArray(input.anchorIds) ? input.anchorIds.slice() : [],
    geometryRole: input.geometryRole || 'UNKNOWN',
    attributes:   Object.assign({}, input.attributes),
    rawAttributes:Object.assign({}, input.rawAttributes),
    derived:      Object.assign({}, input.derived),
    capabilities: input.capabilities || defaultCapabilities(input.type),
    diagnostics:  Array.isArray(input.diagnostics) ? input.diagnostics.slice() : []
  };
  // Preserve extra keys for round-trip fidelity
  for (const key of Object.keys(input)) {
    if (!(key in component)) component[key] = input[key];
  }
  return component;
}
