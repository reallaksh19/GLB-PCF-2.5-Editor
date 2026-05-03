/**
 * Render projection builder.
 *
 * This module bridges the canonical edit graph (CEG) and the render
 * layer. It generates a RenderIndex populated with body and grip
 * objects for each component and anchor. Labels are not generated
 * automatically; label creation can be triggered separately.
 */

import { createRenderIndex } from './render-index.js';
import { createBodyObject } from './component-renderer.js';
import { createGripObject } from './grip-renderer.js';
import { highlightSelection } from './selection-renderer.js';

/**
 * Build a render projection from a canonical edit graph.
 *
 * Each component produces a body object. Components with anchorIds
 * produce grip objects. All objects are registered in the render
 * index for bi-directional lookup.
 *
 * @param {Object} graph The canonical edit graph
 * @returns {Object} A render index containing bodies and grips
 */
export function buildRenderProjection(graph) {
  const index = createRenderIndex();
  if (!graph || !graph.components) return index;
  // Iterate over components
  Object.keys(graph.components).forEach(compId => {
    const comp = graph.components[compId];
    const body = createBodyObject(comp);
    // Register body
    index.componentToObjects.set(compId, [body]);
    index.objectToComponent.set(body, compId);
    // Register grips for editable anchors
    if (Array.isArray(comp.anchorIds)) {
      comp.anchorIds.forEach(anchorId => {
        const grip = createGripObject(compId, anchorId);
        index.anchorToGrip.set(anchorId, grip);
      });
    }
    // Associate with layer
    const layerName = comp.layerId || 'default';
    if (!index.layerToObjects.has(layerName)) {
      index.layerToObjects.set(layerName, []);
    }
    index.layerToObjects.get(layerName).push(body);
  });
  return index;
}

/**
 * Update an existing render index with a new canonical edit graph.
 *
 * When a graph changes the safest operation is to rebuild the
 * projection from scratch.  However, this helper accepts an
 * existing render index and will attempt to update only the
 * affected entries if a list of changed component ids is provided.
 * If no changed component ids are specified the index is rebuilt
 * entirely.
 *
 * @param {Object} index Existing render index created by buildRenderProjection
 * @param {Object} graph The updated canonical edit graph
 * @param {string[]} [changedIds] Optional list of component ids that changed
 * @returns {Object} The updated render index
 */
export function updateRenderProjection(index, graph, changedIds = null) {
  // If no index exists just build a new one
  if (!index) {
    return buildRenderProjection(graph);
  }
  // If no graph or no components present just clear the index
  if (!graph || !graph.components) {
    return createRenderIndex();
  }
  // If changedIds is falsy, rebuild the entire index
  if (!changedIds || changedIds.length === 0) {
    return buildRenderProjection(graph);
  }
  // Remove old render objects for changed components and anchors
  changedIds.forEach(compId => {
    const objs = index.componentToObjects.get(compId);
    if (objs) {
      objs.forEach(obj => {
        index.objectToComponent.delete(obj);
      });
    }
    index.componentToObjects.delete(compId);
    // Remove grips associated with anchors of this component
    const comp = graph.components[compId];
    if (comp && Array.isArray(comp.anchorIds)) {
      comp.anchorIds.forEach(anchorId => {
        index.anchorToGrip.delete(anchorId);
      });
    }
  });
  // Rebuild entries for changed components
  changedIds.forEach(compId => {
    const comp = graph.components[compId];
    if (!comp) return;
    const body = createBodyObject(comp);
    index.componentToObjects.set(compId, [body]);
    index.objectToComponent.set(body, compId);
    if (Array.isArray(comp.anchorIds)) {
      comp.anchorIds.forEach(anchorId => {
        const grip = createGripObject(compId, anchorId);
        index.anchorToGrip.set(anchorId, grip);
      });
    }
    const layerName = comp.layerId || 'default';
    if (!index.layerToObjects.has(layerName)) {
      index.layerToObjects.set(layerName, []);
    }
    index.layerToObjects.get(layerName).push(body);
  });
  return index;
}

/**
 * Apply layer visibility changes to the render index.  This helper
 * iterates over render objects in the specified layer and toggles a
 * `hidden` property on each object.  Rendering systems should
 * respect this flag when drawing objects.  This function does not
 * mutate the CEG.
 *
 * @param {Object} index The render index
 * @param {string} layerId Layer name to update
 * @param {boolean} visible Whether the layer should be visible
 */
export function applyLayerVisibility(index, layerId, visible) {
  if (!index || !index.layerToObjects) return;
  const objs = index.layerToObjects.get(layerId);
  if (!objs) return;
  objs.forEach(obj => {
    obj.hidden = !visible;
  });
}

/**
 * Convenience function to update selection highlighting.  This
 * delegates to highlightSelection but avoids the need for callers
 * to import from selection‑renderer directly.
 *
 * @param {Object} index The render index
 * @param {Object} selection Selection snapshot with componentIds and anchorIds
 */
export function updateSelectionHighlight(index, selection) {
  highlightSelection(index, selection);
}