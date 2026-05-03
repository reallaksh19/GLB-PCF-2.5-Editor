/*
 * core/geometry/anchors.js
 *
 * Helper functions for manipulating anchors within a CEG.  These
 * functions do not mutate the original graph; instead they clone
 * structures as needed to preserve immutability.
 */

/**
 * Resolve an anchor by ID.  Throws if the anchor is missing.
 *
 * @param {Object} graph The CEG instance.
 * @param {string} anchorId The anchor ID.
 */
export function getAnchor(graph, anchorId) {
  const anchor = graph.anchors[anchorId];
  if (!anchor) {
    throw new Error(`Anchor not found: ${anchorId}`);
  }
  return anchor;
}

/**
 * Clone the anchors map with an updated anchor.  The original
 * graph is untouched.  The returned anchors map shares unchanged
 * anchors by reference.
 *
 * @param {Object} graph The CEG instance.
 * @param {string} anchorId The anchor ID to update.
 * @param {Object} newAnchor The replacement anchor object.
 * @returns {Object} New anchors map.
 */
export function updateAnchor(graph, anchorId, newAnchor) {
  const nextAnchors = { ...graph.anchors };
  nextAnchors[anchorId] = newAnchor;
  return nextAnchors;
}

/**
 * Compute whether an anchor has any remaining component references.
 *
 * @param {Object} graph The CEG instance.
 * @param {string} anchorId The anchor ID.
 * @param {Object} [components] Optional components map to check.  If
 *   omitted the graph's own components are used.
 * @returns {boolean} True if at least one component references the anchor.
 */
export function isAnchorReferenced(graph, anchorId, components = graph.components) {
  for (const compId of Object.keys(components)) {
    const comp = components[compId];
    if (Array.isArray(comp.anchorIds) && comp.anchorIds.includes(anchorId)) {
      return true;
    }
  }
  return false;
}