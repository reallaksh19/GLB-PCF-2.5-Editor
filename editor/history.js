/**
 * editor/history.js
 * Frozen history record schema contract for future editing waves.
 */
export const HISTORY_CONTRACT_VERSION = '1.0.0-wave0';

export function createInitialHistoryState() {
  return {
    contractVersion: HISTORY_CONTRACT_VERSION,
    undoStack: [],
    redoStack: [],
    currentTransaction: null,
  };
}

export function createHistoryRecord(command, patch, meta = {}) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    command,
    patch,
    meta: {
      contractVersion: HISTORY_CONTRACT_VERSION,
      source: command?.meta?.source || 'ui',
      ...meta,
    },
  };
}
