/**
 * integration/debug-model-schema.js
 * Shared debug surface cache schema.
 */
export const DEBUG_MODEL_SCHEMA_VERSION = '1.0.0-wave0';

export const initialDebugModel = {
  contractVersion: DEBUG_MODEL_SCHEMA_VERSION,
  components: [],
  domain: null,
  selectedId: null,
  traces: [],
  logs: [],
  validation: [],
  lastLoadMeta: null,
};
