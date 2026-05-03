/**
 * Export panel module.
 *
 * Handles exporting the canonical edit graph to various formats. This
 * stub simply calls the appropriate exporter functions and returns
 * their output. Real implementations should save files or trigger
 * downloads in the browser.
 */

import { cegToDxf } from '../../formats/dxf/ceg-to-dxf.js';
import { cegToGltf } from '../../formats/gltf/ceg-to-gltf.js';

/**
 * Export the current model as DXF text.
 *
 * @param {Object} graph Canonical edit graph
 * @returns {string} DXF content
 */
export function exportDxf(graph) {
  return cegToDxf(graph);
}

/**
 * Export the current model as GLTF JSON.
 *
 * @param {Object} graph Canonical edit graph
 * @returns {Object} GLTF JSON
 */
export function exportGltf(graph) {
  return cegToGltf(graph);
}