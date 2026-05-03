/*
 * core/ceg/canonical-edit-graph.js
 *
 * Defines the Canonical Edit Graph (CEG) factory.  The CEG is the
 * authoritative data structure describing an editable engineering
 * document.  Import adapters create a CEG, editors mutate it via
 * commands, and exporters serialize it back to external formats.
 */

export const CEG_SCHEMA_VERSION = 'CEG-1.0';

/**
 * Create an empty Canonical Edit Graph.  The returned object is a
 * plain JavaScript structure with no methods.  Mutations should
 * always happen through the command dispatcher or through
 * explicit CEG API functions to ensure consistency and hashing.
 *
 * @param {Object} [input] Optional initial document metadata.
 * @returns {Object} The new CEG instance.
 */
export function createCanonicalEditGraph(input = {}) {
  return {
    schemaVersion: CEG_SCHEMA_VERSION,
    document: {
      id: input.id || 'doc_001',
      name: input.name || 'Untitled',
      units: input.units || 'mm',
      sourceFormat: input.sourceFormat || 'UNKNOWN',
      coordinateSystem: input.coordinateSystem || 'WORLD_XYZ'
    },
    components: {},
    anchors: {},
    topologyLinks: [],
    layers: {},
    sourceRefs: {},
    renderRefs: {},
    diagnostics: [],
    lossContract: {
      unsupportedEntities: [],
      downgradedEntities: [],
      proxyEntities: [],
      exportWarnings: []
    },
    commandJournal: []
  };
}