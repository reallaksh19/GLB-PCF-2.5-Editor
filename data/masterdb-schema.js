import { REQUIRED_VISIBLE_COLUMNS } from './masterdb-contract.js';

export const MASTERDB_VISIBLE_COLUMNS = Object.freeze([
  ...REQUIRED_VISIBLE_COLUMNS,
  'Subtype',
  'Rating',
  'Schedule',
  'EndType',
  'Facing',
]);

export const MASTERDB_INTERNAL_COLUMNS = Object.freeze([
  'id',
  'component',
  'subtype',
  'size',
  'rating',
  'schedule',
  'facing',
  'endType',
  'length',
  'weight',
  'source',
]);

export const MASTERDB_STORAGE_KEY = 'glb-pcf-editor-masterdb-v1';

export const MASTERDB_SEED_ROWS = Object.freeze([
  { Component: 'VALVE', Subtype: 'GATE', Size: '100', Rating: '150', EndType: 'FLANGED', Length: 292, Weight: 84.5 },
  { Component: 'VALVE', Subtype: 'BALL', Size: '100', Rating: '150', EndType: 'FLANGED', Length: 229, Weight: 52.0 },
  { Component: 'VALVE', Subtype: 'CHECK', Size: '100', Rating: '150', EndType: 'FLANGED', Length: 229, Weight: 61.4 },
  { Component: 'FLANGE', Subtype: 'WN', Size: '100', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 24, Weight: 10.1 },
  { Component: 'FLANGE', Subtype: 'SO', Size: '100', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 18, Weight: 7.8 },
  { Component: 'ELBOW', Subtype: 'LR', Size: '100', Rating: '150', Length: 152, Weight: 8.2 },
  { Component: 'ELBOW', Subtype: 'SR', Size: '100', Rating: '150', Length: 102, Weight: 6.4 },
  { Component: 'TEE', Subtype: 'EQUAL', Size: '100', Rating: '150', Length: 178, Weight: 19.5 },
  { Component: 'REDUCER', Subtype: 'CONCENTRIC', Size: '150x100', Rating: '150', Length: 127, Weight: 7.3 },
  { Component: 'SUPPORT', Subtype: 'REST', Size: '100', Rating: '', Length: 120, Weight: 6.0 },
]);
