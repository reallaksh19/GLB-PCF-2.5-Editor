/*
 * formats/dxf/dxf-loss-contract.js
 *
 * Helpers for recording DXF‑specific loss information on a CEG.  The
 * Canonical Edit Graph has a built‑in lossContract that tracks
 * unsupported entities, downgraded entities, proxy creations and
 * export warnings.  These functions simply push appropriate
 * descriptors onto the relevant arrays.
 */

/**
 * Record an unsupported DXF entity in the graph’s loss contract.
 *
 * @param {Object} graph The CEG instance.
 * @param {Object} entity The raw DXF entity that could not be mapped.
 */
export function recordUnsupportedEntity(graph, entity) {
  if (!graph || !graph.lossContract) return;
  graph.lossContract.unsupportedEntities.push({
    type: entity?.type || 'UNKNOWN',
    handle: entity?.handle || null
  });
}

/**
 * Record a downgraded entity (e.g. an ARC exported as a polyline).
 *
 * @param {Object} graph The CEG instance.
 * @param {string} reason Description of the downgrade.
 */
export function recordDowngradedEntity(graph, reason) {
  if (!graph || !graph.lossContract) return;
  graph.lossContract.downgradedEntities.push(reason);
}

/**
 * Record a proxy entity creation on import.
 *
 * @param {Object} graph The CEG instance.
 * @param {string} componentId The ID of the proxy component.
 */
export function recordProxyEntity(graph, componentId) {
  if (!graph || !graph.lossContract) return;
  graph.lossContract.proxyEntities.push(componentId);
}

/**
 * Record an export warning.
 *
 * @param {Object} graph The CEG instance.
 * @param {string} message Warning message.
 */
export function recordExportWarning(graph, message) {
  if (!graph || !graph.lossContract) return;
  graph.lossContract.exportWarnings.push(message);
}