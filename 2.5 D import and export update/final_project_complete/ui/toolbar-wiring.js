/**
 * Toolbar wiring module.
 *
 * Provides functions to bind toolbar actions to tool changes and
 * command dispatches. In this stub we expose simple callbacks that
 * external UI code can call in response to button clicks.
 */

import { setTool } from '../editor/active-tool-controller.js';
import { dispatchCommand } from '../core/commands/command-dispatcher.js';
import { CommandType } from '../core/commands/command-types.js';
import { getSelection } from '../editor/selection-controller.js';

// Internal reference to the canonical edit graph.  The toolbar
// module itself does not store or mutate the graph; it relies on
// the host application to provide the current graph via setGraph().
// When a delete command is issued the returned graph is stored
// internally so subsequent deletes operate on the updated graph.
let _graphRef = null;

/**
 * Provide the canonical edit graph to the toolbar wiring.  This
 * function must be called by the host application before any
 * command-dispatching actions occur.  The toolbar stores the
 * graph internally and updates its reference when commands are
 * executed.  The caller should update their own graph reference
 * from the return value of onDeleteClick().
 *
 * @param {Object} graph Canonical edit graph
 */
export function setGraph(graph) {
  _graphRef = graph;
}

// Tool change handlers
export function onSelectClick() {
  setTool('SELECT');
}
export function onMoveClick() {
  setTool('MOVE');
}
export function onMoveAnchorClick() {
  setTool('MOVE_ANCHOR');
}
export function onExtendClick() {
  setTool('EXTEND');
}
export function onStretchClick() {
  setTool('STRETCH');
}
export function onDeleteClick() {
  // Dispatch delete command on selected components. Anchors are ignored.
  if (!_graphRef) return _graphRef;
  const selection = getSelection();
  const ids = Array.from(selection.componentIds);
  if (ids.length === 0) return _graphRef;
  const next = dispatchCommand(_graphRef, {
    type: CommandType.DELETE_COMPONENTS,
    selection: ids
  });
  // Update internal graph reference so further deletes use the new state
  _graphRef = next;
  return next;
}