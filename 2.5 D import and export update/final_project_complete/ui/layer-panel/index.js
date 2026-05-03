/**
 * Layer panel module.
 *
 * Provides simple layer visibility toggling. In this stub we track
 * visibility in a map and expose functions to query and update
 * visibility. Real implementations should dispatch a
 * SET_LAYER_VISIBILITY command when toggling.
 */

import { dispatchCommand } from '../../core/commands/command-dispatcher.js';
import { CommandType } from '../../core/commands/command-types.js';

const layerVisibility = new Map();
// Reference to the canonical edit graph.  The host application must
// supply the graph via setGraph() so that visibility toggles can
// dispatch commands.  When a layer is toggled the new graph is
// returned to the caller and stored for subsequent updates.
let _graphRef = null;

/**
 * Initialize the layer panel with a set of layer names. All layers
 * are visible by default.
 *
 * @param {Iterable<string>} layers
 */
export function initLayers(layers) {
  for (const layer of layers) {
    layerVisibility.set(layer, true);
  }
}

/**
 * Get whether a layer is visible.
 *
 * @param {string} layerName
 * @returns {boolean}
 */
export function isLayerVisible(layerName) {
  return layerVisibility.get(layerName) !== false;
}

/**
 * Toggle the visibility of a layer. In a full implementation this
 * would dispatch SET_LAYER_VISIBILITY. Here we update the local map.
 *
 * @param {string} layerName
 * @param {boolean} visible
 */
export function setLayerVisibility(layerName, visible) {
  layerVisibility.set(layerName, !!visible);
  if (!_graphRef) return _graphRef;
  // Dispatch a SET_LAYER_VISIBILITY command on the graph
  const next = dispatchCommand(_graphRef, {
    type: CommandType.SET_LAYER_VISIBILITY,
    payload: { layerId: layerName, visible: !!visible }
  });
  _graphRef = next;
  return next;
}

/**
 * Provide the canonical edit graph used by this panel.  Must be called
 * before toggling visibility.  The graph is stored internally so
 * that commands can be dispatched when layers are toggled.  The
 * caller should update their own graph reference with the return
 * value of setLayerVisibility().
 *
 * @param {Object} graph Canonical edit graph
 */
export function setGraph(graph) {
  _graphRef = graph;
}

/**
 * Get a snapshot of the layer visibility map.
 *
 * @returns {Object} An object keyed by layer name
 */
export function getLayerVisibility() {
  const obj = {};
  for (const [layer, visible] of layerVisibility.entries()) {
    obj[layer] = visible;
  }
  return obj;
}