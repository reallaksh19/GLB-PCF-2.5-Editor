/*
 * core/commands/command-dispatcher.js
 *
 * Applies edit commands to a CEG, computes before/after hashes,
 * appends a journal entry, and reverts if validation fails.
 */

import { CommandType }          from './command-types.js';
import {
  moveComponents, moveAnchors, extendLinearComponent,
  stretchAnchors, deleteComponents, setProperty, setLayerVisibility
} from './geometry-commands.js';
import { hashCeg }              from '../ceg/ceg-hash.js';
import { validateModel }        from '../validation/model-validator.js';

/**
 * Apply a command to a graph and return the next graph state.
 * If validation reports errors the original graph is returned with
 * diagnostics appended.  Warnings are appended but the command is kept.
 *
 * @param {Object} graph   Current CEG.
 * @param {Object} command Command object with { type, selection?, payload?, timestamp? }.
 * @returns {Object} Next CEG state.
 */
export function dispatchCommand(graph, command) {
  const beforeHash = hashCeg(graph);
  let   next       = applyCommand(graph, command);

  const { errors, warnings } = validateModel(next);
  if (errors.length) {
    const reverted = { ...graph };
    reverted.diagnostics = (graph.diagnostics || []).concat(errors);
    return reverted;
  }
  if (warnings.length) {
    next.diagnostics = (next.diagnostics || []).concat(warnings);
  }

  const afterHash    = hashCeg(next);
  const journal      = Array.isArray(next.commandJournal) ? next.commandJournal.slice() : [];
  journal.push({ ...command, beforeHash, afterHash, timestamp: command.timestamp || 0 });
  next.commandJournal = journal;
  return next;
}

function applyCommand(graph, command) {
  const { type } = command;
  switch (type) {
    case CommandType.MOVE_COMPONENTS:
      return moveComponents(graph, command.selection || [], command.payload?.delta || { x:0,y:0,z:0 });
    case CommandType.MOVE_ANCHORS:
      return moveAnchors(graph, command.payload?.anchors || [], command.payload?.delta || { x:0,y:0,z:0 });
    case CommandType.EXTEND_LINEAR:
      return extendLinearComponent(graph, command.payload?.componentId, command.payload?.endpoint, command.payload?.newLength);
    case CommandType.STRETCH_ANCHORS:
      return stretchAnchors(graph, command.payload?.anchors || [], command.payload?.delta || { x:0,y:0,z:0 });
    case CommandType.DELETE_COMPONENTS:
      return deleteComponents(graph, command.selection || []);
    case CommandType.SET_PROPERTY:
      return setProperty(graph, command.payload || {});
    case CommandType.SET_LAYER_VISIBILITY:
      return setLayerVisibility(graph, command.payload || {});
    default: {
      const next = { ...graph };
      next.diagnostics = (graph.diagnostics || []).concat({ code: 'UNKNOWN_COMMAND', message: `Unknown command type ${type}` });
      return next;
    }
  }
}
