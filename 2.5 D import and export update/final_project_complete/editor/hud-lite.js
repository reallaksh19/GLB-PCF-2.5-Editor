/**
 * HUD-lite module.
 *
 * Provides a minimal interface for displaying editing values such as
 * selected component id, anchor id, current length and delta fields.
 * For the static editor prototype this simply stores the latest
 * displayed values and does not render anything on screen.
 */

const hudState = {
  visible: false,
  fields: {}
};

/**
 * Show the HUD with the given fields. The fields object may contain
 * keys such as selectedComponentId, selectedAnchorId, currentLength,
 * newLength, deltaX, deltaY, deltaZ, disabledReason. Only keys
 * provided will be stored.
 *
 * @param {Object} fields Values to display
 */
export function showHud(fields) {
  hudState.visible = true;
  hudState.fields = { ...fields };
}

/**
 * Hide the HUD.
 */
export function hideHud() {
  hudState.visible = false;
  hudState.fields = {};
}

/**
 * Get the current HUD state. Useful for testing.
 *
 * @returns {Object} HUD state
 */
export function getHudState() {
  return { visible: hudState.visible, fields: { ...hudState.fields } };
}