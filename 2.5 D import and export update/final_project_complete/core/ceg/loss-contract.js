/*
 * core/ceg/loss-contract.js
 *
 * The loss contract records information lost or downgraded during
 * import/export.  It helps end‑users understand limitations of
 * format conversions.
 */

/**
 * Create an empty loss contract.  Each array stores items of
 * arbitrary type (strings, objects) describing the loss.
 */
export function createLossContract() {
  return {
    unsupportedEntities: [],
    downgradedEntities: [],
    proxyEntities: [],
    exportWarnings: []
  };
}