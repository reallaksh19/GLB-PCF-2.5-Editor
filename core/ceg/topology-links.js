/*
 * core/ceg/topology-links.js
 *
 * Topology links describe connectivity between anchors.
 * In Wave 1 they are informational only; commands do not manipulate them.
 */

/**
 * Create a topology link.
 *
 * @param {string[]} anchorIds Anchor IDs involved in the link.
 * @param {Object}   [metadata] Optional metadata.
 * @returns {Object} Topology link record.
 */
export function createTopologyLink(anchorIds, metadata = {}) {
  return {
    anchorIds: Array.isArray(anchorIds) ? anchorIds.slice() : [],
    metadata:  { ...metadata }
  };
}

/**
 * Append a topology link to the CEG, returning a new graph object.
 *
 * @param {Object} graph CEG instance.
 * @param {Object} link  Link produced by createTopologyLink.
 * @returns {Object} New graph with the link appended.
 */
export function addTopologyLink(graph, link) {
  const next = { ...graph, topologyLinks: graph.topologyLinks.slice() };
  next.topologyLinks.push(link);
  return next;
}
