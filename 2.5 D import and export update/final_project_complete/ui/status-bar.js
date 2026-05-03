/**
 * Status bar module.
 *
 * Tracks and exposes a simple status message that can be updated
 * throughout the application lifecycle. A real implementation would
 * reflect undo/redo state, dirty status, etc.
 */

let _message = '';

export function setStatus(message) {
  _message = message;
}

export function getStatus() {
  return _message;
}