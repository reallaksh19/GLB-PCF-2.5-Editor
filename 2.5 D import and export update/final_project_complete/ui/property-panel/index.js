/**
 * Property panel module.
 *
 * This stub stores a reference to the currently displayed component
 * and exposes functions to update component properties. Real UI
 * implementations should render a form and dispatch commands when
 * fields change.
 */

import { dispatchCommand } from '../../core/commands/command-dispatcher.js';
import { CommandType } from '../../core/commands/command-types.js';

//
// State for the property panel.  The panel keeps a reference to the
// component currently being displayed.  Editing functions do not
// mutate this component directly; instead they dispatch commands on
// the canonical edit graph.  The host application must provide the
// current graph via setGraph() so that edits can be applied.
//
let _component = null;
// Internal reference to the canonical edit graph.  This is set by
// setGraph() and used by editProperty() when dispatching a command.
let _graphRef = null;

/**
 * Show the property panel for a component.
 *
 * @param {Object} component Canonical component to display
 */
export function showPropertyPanel(component) {
  _component = component;
}

/**
 * Hide the property panel.
 */
export function hidePropertyPanel() {
  _component = null;
}

/**
 * Edit a property on the current component. In a full
 * implementation this would dispatch a SET_PROPERTY command. This
 * stub simply updates the local component object.
 *
 * @param {string} path Path to the property (e.g. 'geometry.ep1.x')
 * @param {*} value New value
 */
export function editProperty(path, value) {
  // Require a component and a graph
  if (!_component || !_graphRef) return;
  const graph = _graphRef;
  // Dispatch a SET_PROPERTY command on the canonical graph
  const command = {
    type: CommandType.SET_PROPERTY,
    payload: {
      componentId: _component.id,
      path,
      value
    }
  };
  const next = dispatchCommand(graph, command);
  // Update the graph reference for subsequent edits
  _graphRef = next;
  // Update the local component reference from the updated graph
  _component = next.components[_component.id] || null;
  return next;
}

/**
 * Supply the canonical edit graph to the property panel.  This
 * function must be called by the host application before any
 * property edits occur.  The panel stores the graph on
 * editProperty._graph and will update it as edits are applied.
 *
 * @param {Object} graph Canonical edit graph
 */
export function setGraph(graph) {
  _graphRef = graph;
}

/**
 * Get the currently displayed component for inspection.
 *
 * @returns {Object|null} The current component
 */
export function getCurrentComponent() {
  return _component;
}