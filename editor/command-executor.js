/**
 * editor/command-executor.js
 * Thin wrapper over the frozen command handler registry.
 */

import { executeCommand as executeRegisteredCommand } from './command-handlers.js';

export function executeEditorCommand(store, command) {
  return executeRegisteredCommand(store, command);
}
