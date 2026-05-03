/*
 * core/ceg/topology-links.js
 *
 * Topology links describe connectivity between anchors.  A link
 * connects two or more anchor IDs and may optionally include
 * metadata about the connection (e.g. branch, tee, weld).  In Wave 1
 * topology links are not manipulated by commands, but the API is
 * provided here for future expansion.
 */

/**
 * Create a topology link connecting one or more anchors.
 *
 * @param {string[]} anchorIds Array of anchor IDs involved in the link.
 * @param {Object} [metadata] Optional metadata describing the link.
 * @returns {Object} A topology link record.
 */
export function createTopologyLink(anchorIds, metadata = {}) {
  return {
    anchorIds: Array.isArray(anchorIds) ? anchorIds.slice() : [],
    metadata: { ...metadata }
  };
}

/**
 * Add a topology link to the CEG.  The caller is responsible for
 * ensuring that the anchors exist.  Returns a new array of links.
 *
 * @param {Object} graph The CEG.
 * @param {Object} link The link to add.
 * @returns {Object} The new graph with the link appended.
 */
export function addTopologyLink(graph, link) {
  const next = { ...graph, topologyLinks: graph.topologyLinks.slice() };
  next.topologyLinks.push(link);
  return next;
}