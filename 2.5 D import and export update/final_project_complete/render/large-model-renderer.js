/**
 * Large model renderer.
 *
 * This module contains placeholders for handling very large models.
 * In a complete implementation this might implement tiling,
 * frustum culling, streaming or other techniques. For the static
 * editor prototype it simply reports that models are small.
 */

/**
 * Determine if a model is considered large. This simplistic
 * implementation always returns false.
 *
 * @param {Object} model Canonical edit graph
 * @returns {boolean}
 */
export function isLargeModel(model) {
  return false;
}

/**
 * Prepare rendering structures for a large model. This stub returns
 * an empty object; a full implementation might partition the model
 * into spatial cells or generate LOD proxies.
 *
 * @param {Object} model The canonical edit graph
 * @returns {Object} An object representing large-model rendering state
 */
export function prepareLargeModelRender(model) {
  return {};
}