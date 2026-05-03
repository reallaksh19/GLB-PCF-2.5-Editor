/*
 * core/ceg/canonical-component.js
 *
 * Defines the structure of a component within a Canonical Edit Graph.
 * Components represent discrete engineering objects such as pipes,
 * lines, valves, flanges and arbitrary mesh proxies.  Components do
 * not include geometry points directly; instead they reference
 * anchors by ID.
 */

import { defaultCapabilities } from './capabilities.js';

/**
 * Create a canonical component.  All unrecognised fields from the
 * input are copied through, allowing adapters to preserve
 * additional metadata.
 *
 * @param {Object} input Input fields describing the component.
 * @returns {Object} A component record.
 */
export function createComponent(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('createComponent requires an input object');
  }
  const component = {
    id: input.id,
    type: input.type,
    layerId: input.layerId || 'default',
    anchorIds: Array.isArray(input.anchorIds) ? input.anchorIds.slice() : [],
    geometryRole: input.geometryRole || 'UNKNOWN',
    attributes: Object.assign({}, input.attributes),
    rawAttributes: Object.assign({}, input.rawAttributes),
    derived: Object.assign({}, input.derived),
    capabilities: input.capabilities || defaultCapabilities(input.type),
    diagnostics: Array.isArray(input.diagnostics) ? input.diagnostics.slice() : []
  };
  // Preserve any extra keys on the input for round‑trip fidelity
  for (const key of Object.keys(input)) {
    if (!(key in component)) {
      component[key] = input[key];
    }
  }
  return component;
}