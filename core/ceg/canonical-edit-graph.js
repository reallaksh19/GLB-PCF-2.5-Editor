/*
 * core/ceg/canonical-edit-graph.js
 *
 * Canonical Edit Graph (CEG) factory — the single source of truth for
 * all import/export/edit operations.  Import adapters create a CEG;
 * editors mutate it via the command dispatcher; exporters serialize it.
 */

export const CEG_SCHEMA_VERSION = 'CEG-1.0';

/**
 * Create an empty Canonical Edit Graph.  The returned value is a plain
 * JS object with no methods — all mutations must go through the command
 * dispatcher or explicit CEG API functions to preserve hashing integrity.
 *
 * @param {Object} [input] Optional initial document metadata.
 * @returns {Object} A new CEG instance.
 */
export function createCanonicalEditGraph(input = {}) {
  return {
    schemaVersion: CEG_SCHEMA_VERSION,
    document: {
      id:               input.id               || 'doc_001',
      name:             input.name             || 'Untitled',
      units:            input.units            || 'mm',
      sourceFormat:     input.sourceFormat     || 'UNKNOWN',
      coordinateSystem: input.coordinateSystem || 'WORLD_XYZ'
    },
    components:    {},
    anchors:       {},
    topologyLinks: [],
    layers:        {},
    sourceRefs:    {},
    renderRefs:    {},
    diagnostics:   [],
    lossContract: {
      unsupportedEntities: [],
      downgradedEntities:  [],
      proxyEntities:       [],
      exportWarnings:      []
    },
    commandJournal: []
  };
}
