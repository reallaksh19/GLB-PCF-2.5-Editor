/**
 * editor/command-handlers.js
 * Public handler signature contract. Implementing agents should register handlers here
 * or through adapter modules without mutating scene state directly.
 */
import { COMMAND_CONTRACT_VERSION } from './command-types.js';

export const COMMAND_HANDLER_CONTRACT_VERSION = COMMAND_CONTRACT_VERSION;
const commandHandlers = new Map();

export function registerCommandHandler(type, handler) {
  if (!type || typeof handler !== 'function') {
    throw new Error('registerCommandHandler(type, handler) requires a valid handler');
  }
  commandHandlers.set(type, handler);
}

export function getCommandHandler(type) {
  return commandHandlers.get(type) || null;
}

export function listRegisteredHandlers() {
  return [...commandHandlers.keys()].sort();
}

export function executeCommand(store, command) {
  const handler = getCommandHandler(command?.type);
  if (!handler) throw new Error(`Unknown command: ${command?.type}`);
  const patch = handler(store.getState(), command);
  store.applyPatch(patch, command);
  return patch;
}
