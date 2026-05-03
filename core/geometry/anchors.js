/*
 * core/geometry/anchors.js
 *
 * Helper functions for manipulating anchors within a CEG.
 * Nothing here mutates the original graph; all operations return new objects.
 */

/**
 * Resolve an anchor by ID.  Throws if the anchor is missing.
 */
export function getAnchor(graph, anchorId) {
  const anchor = graph.anchors[anchorId];
  if (!anchor) throw new Error(`Anchor not found: ${anchorId}`);
  return anchor;
}

/**
 * Return a new anchors map with a single anchor replaced.
 */
export function updateAnchor(graph, anchorId, newAnchor) {
  const next = { ...graph.anchors };
  next[anchorId] = newAnchor;
  return next;
}

/**
 * Return true if any component in `components` references `anchorId`.
 *
 * @param {Object}  graph      CEG (used only if components is omitted).
 * @param {string}  anchorId
 * @param {Object}  [components] Components map to search; defaults to graph.components.
 */
export function isAnchorReferenced(graph, anchorId, components = graph.components) {
  for (const compId of Object.keys(components)) {
    const comp = components[compId];
    if (Array.isArray(comp.anchorIds) && comp.anchorIds.includes(anchorId)) return true;
  }
  return false;
}
