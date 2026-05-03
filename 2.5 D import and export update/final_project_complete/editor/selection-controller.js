/**
 * Selection Controller.
 *
 * Maintains the current selection state for components and anchors.
 * Selection can be queried and updated by interaction code and panels.
 */

const _selection = {
  componentIds: new Set(),
  anchorIds: new Set()
};

/**
 * Clear all selection state.
 */
export function clearSelection() {
  _selection.componentIds.clear();
  _selection.anchorIds.clear();
}

/**
 * Add a component id to the selection. Does not clear previous
 * selection. Use clearSelection() first for single-select behavior.
 *
 * @param {string} id Canonical component id
 */
export function selectComponent(id) {
  _selection.componentIds.add(id);
}

/**
 * Add an anchor id to the selection.
 *
 * @param {string} id Canonical anchor id
 */
export function selectAnchor(id) {
  _selection.anchorIds.add(id);
}

/**
 * Remove a component from the selection.
 *
 * @param {string} id Canonical component id
 */
export function deselectComponent(id) {
  _selection.componentIds.delete(id);
}

/**
 * Remove an anchor from the selection.
 *
 * @param {string} id Canonical anchor id
 */
export function deselectAnchor(id) {
  _selection.anchorIds.delete(id);
}

/**
 * Get a snapshot of the current selection. Returns new Sets so
 * callers cannot mutate the internal state directly.
 *
 * @returns {Object} Snapshot of selection with componentIds and anchorIds
 */
export function getSelection() {
  return {
    componentIds: new Set(_selection.componentIds),
    anchorIds: new Set(_selection.anchorIds)
  };
}