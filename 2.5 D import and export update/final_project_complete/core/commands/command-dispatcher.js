/*
 * core/commands/command-dispatcher.js
 *
 * The command dispatcher applies edit commands to a Canonical Edit
 * Graph, computes before/after hashes and appends a journal entry.
 * It also performs validation and reverts the change if errors are
 * detected.
 */

import { CommandType } from './command-types.js';
import {
  moveComponents,
  moveAnchors,
  extendLinearComponent,
  stretchAnchors,
  deleteComponents,
  setProperty,
  setLayerVisibility
} from './geometry-commands.js';
import { hashCeg } from '../ceg/ceg-hash.js';
import { validateModel } from '../validation/model-validator.js';

/**
 * Apply a command to a graph and return the mutated graph.  The
 * dispatcher encapsulates the full command lifecycle including
 * hashing, validation and journalling.
 *
 * @param {Object} graph The current CEG.
 * @param {Object} command The command to apply.
 * @returns {Object} The next CEG state.  If validation fails the
 *   original graph is returned with diagnostics appended.
 */
export function dispatchCommand(graph, command) {
  const beforeHash = hashCeg(graph);
  let next = applyCommand(graph, command);
  // Validate the model after command application
  const { errors, warnings } = validateModel(next);
  if (errors.length) {
    // Revert to previous graph and record errors
    const reverted = { ...graph };
    reverted.diagnostics = (graph.diagnostics || []).concat(errors);
    return reverted;
  }
  // Append warnings
  if (warnings.length) {
    next.diagnostics = (graph.diagnostics || []).concat(warnings);
  }
  // Compute after hash and append journal entry
  const afterHash = hashCeg(next);
  const journalEntry = {
    ...command,
    beforeHash,
    afterHash,
    timestamp: command.timestamp || 0
  };
  const journal = Array.isArray(next.commandJournal) ? next.commandJournal.slice() : [];
  journal.push(journalEntry);
  next.commandJournal = journal;
  return next;
}

/**
 * Apply the core mutation for a command type.  Returns a new graph
 * instance.  Does not perform journalling or validation.
 *
 * @param {Object} graph The current CEG.
 * @param {Object} command Command with type and payload.
 */
function applyCommand(graph, command) {
  const type = command.type;
  switch (type) {
    case CommandType.MOVE_COMPONENTS:
      return moveComponents(graph, command.selection || [], command.payload?.delta || { x: 0, y: 0, z: 0 });
    case CommandType.MOVE_ANCHORS:
      return moveAnchors(graph, command.payload?.anchors || [], command.payload?.delta || { x: 0, y: 0, z: 0 });
    case CommandType.EXTEND_LINEAR:
      return extendLinearComponent(
        graph,
        command.payload?.componentId,
        command.payload?.endpoint,
        command.payload?.newLength
      );
    case CommandType.STRETCH_ANCHORS:
      return stretchAnchors(graph, command.payload?.anchors || [], command.payload?.delta || { x: 0, y: 0, z: 0 });
    case CommandType.DELETE_COMPONENTS:
      return deleteComponents(graph, command.selection || []);
    case CommandType.SET_PROPERTY:
      return setProperty(graph, command.payload || {});
    case CommandType.SET_LAYER_VISIBILITY:
      return setLayerVisibility(graph, command.payload || {});
    default:
      // Unknown command – no change but record diagnostic
      const next = { ...graph };
      next.diagnostics = (graph.diagnostics || []).concat({ code: 'UNKNOWN_COMMAND', message: `Unknown command type ${type}` });
      return next;
  }
}