/**
 * Selection renderer.
 *
 * Updates render objects to reflect the current selection in the
 * application. This helper works purely with render index data and
 * does not interact with the CEG or commands. Highlighting logic
 * should be separate from model mutation.
 */

/**
 * Highlight the current selection on the render objects.
 *
 * @param {Object} renderState The render index created by buildRenderProjection
 * @param {Object} selection An object with componentIds and anchorIds sets
 */
export function highlightSelection(renderState, selection) {
  // Reset all selection flags
  for (const objs of renderState.componentToObjects.values()) {
    objs.forEach(obj => {
      if (obj.userData.renderRole === 'BODY' || obj.userData.renderRole === 'LABEL') {
        obj.selected = false;
      }
    });
  }
  for (const grip of renderState.anchorToGrip.values()) {
    grip.selected = false;
  }
  // Highlight selected components
  if (selection && selection.componentIds) {
    selection.componentIds.forEach(id => {
      const objs = renderState.componentToObjects.get(id);
      if (objs) {
        objs.forEach(obj => {
          obj.selected = true;
        });
      }
    });
  }
  // Highlight selected anchors/grips
  if (selection && selection.anchorIds) {
    selection.anchorIds.forEach(id => {
      const grip = renderState.anchorToGrip.get(id);
      if (grip) {
        grip.selected = true;
      }
    });
  }
}