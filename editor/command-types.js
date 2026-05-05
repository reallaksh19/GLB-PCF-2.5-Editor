/**
 * editor/command-types.js
 * Wave 0 orchestrator contract freeze for command envelopes.
 */
export const COMMAND_CONTRACT_VERSION = '1.0.0-wave0';

export const CommandTypes = Object.freeze({
  ROUTE_START: 'ROUTE_START',
  ROUTE_SEGMENT_ADD: 'ROUTE_SEGMENT_ADD',
  ROUTE_SEGMENT_EDIT: 'ROUTE_SEGMENT_EDIT',
  ROUTE_NODE_MOVE: 'ROUTE_NODE_MOVE',
  ROUTE_POLYLINE_CREATE: 'ROUTE_POLYLINE_CREATE',
  ROUTE_SPLIT_SEGMENT: 'ROUTE_SPLIT_SEGMENT',
  ROUTE_DELETE: 'ROUTE_DELETE',
  ROUTE_STRETCH: 'ROUTE_STRETCH',
  ROUTE_ROTATE: 'ROUTE_ROTATE',
  ROUTE_BREAK: 'ROUTE_BREAK',
  GUIDE_CREATE: 'GUIDE_CREATE',
  GUIDE_MOVE: 'GUIDE_MOVE',
  GUIDE_DELETE: 'GUIDE_DELETE',
  INSERT_COMPONENT: 'INSERT_COMPONENT',
  DELETE_COMPONENT: 'DELETE_COMPONENT',
  AUTO_BEND: 'AUTO_BEND',
  AUTO_TEE: 'AUTO_TEE',
  HUD_PREVIEW_UPDATE: 'HUD_PREVIEW_UPDATE',
  MASTERDB_PUBLISH: 'MASTERDB_PUBLISH',
  MACRO_RUN: 'MACRO_RUN',
});

export function createCommand(type, payload = {}, meta = {}) {
  if (!type || typeof type !== 'string') throw new Error('Command type is required');
  return {
    id: globalThis.crypto?.randomUUID?.() || `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    meta: {
      ts: Date.now(),
      source: meta.source || 'ui',
      contractVersion: COMMAND_CONTRACT_VERSION,
      ...meta,
    },
  };
}
