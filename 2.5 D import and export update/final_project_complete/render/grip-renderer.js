/**
 * Grip renderer.
 *
 * Grips provide interactive handles for editing component anchors. A
 * grip carries references back to its component and anchor so that
 * interaction code can dispatch the correct command. Like body
 * objects, grips track a `selected` flag.
 */

/**
 * Create a grip object for a given component anchor.
 *
 * @param {string} componentId The canonical id of the component
 * @param {string} anchorId The canonical id of the anchor
 * @returns {Object} A grip object
 */
export function createGripObject(componentId, anchorId) {
  return {
    userData: {
      canonicalId: componentId,
      anchorId: anchorId,
      renderRole: 'GRIP'
    },
    selected: false
  };
}