/**
 * Active Tool Controller.
 *
 * Tracks the currently selected editing tool. Tools control how
 * mouse/keyboard interactions are interpreted. This module does not
 * mutate the CEG or render state directly; it simply maintains a
 * string identifier of the active tool.
 */

// Default tool is SELECT for picking components
let currentTool = 'SELECT';

/**
 * Set the active tool. Allowed values are 'SELECT', 'MOVE',
 * 'MOVE_ANCHOR', 'EXTEND', 'STRETCH', and 'DELETE'.
 *
 * @param {string} tool The tool name
 */
export function setTool(tool) {
  currentTool = tool;
}

/**
 * Get the currently active tool.
 *
 * @returns {string} The current tool
 */
export function getTool() {
  return currentTool;
}