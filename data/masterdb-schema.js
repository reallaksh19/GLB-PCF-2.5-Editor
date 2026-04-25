import { REQUIRED_VISIBLE_COLUMNS } from './masterdb-contract.js';

export const MASTERDB_VISIBLE_COLUMNS = Object.freeze([
  ...REQUIRED_VISIBLE_COLUMNS,
  'Subtype',
  'Schedule',
  'EndType',
  'Facing',
  'Angle',
  'RadiusType',
  'CenterToEnd',
  'TangentLength',
  'RunSize',
  'BranchSize',
  'RunCenterToEnd',
  'BranchCenterToEnd',
  'Standard',
  'BoreType',
  'Revision',
  'DatasetVersion',
  'Source'
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
  'angle',
  'radiusType',
  'centerToEnd',
  'tangentLength',
  'runSize',
  'branchSize',
  'runCenterToEnd',
  'branchCenterToEnd',
  'standard',
  'boreType',
  'revision',
  'datasetVersion',
  'source',
]);

export const MASTERDB_STORAGE_KEY = 'glb-pcf-editor-masterdb-v1';

export const MASTERDB_SEED_ROWS = Object.freeze([
  // B16.9 ELBOWS (LR, 90 and 45 deg)
  { Component: 'ELBOW', Subtype: 'LR', Size: '50', Rating: 'STD', Angle: 90, Length: 76, Weight: 1.0, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'LR', Size: '50', Rating: 'STD', Angle: 45, Length: 35, Weight: 0.5, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'LR', Size: '100', Rating: 'STD', Angle: 90, Length: 152, Weight: 4.8, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'LR', Size: '100', Rating: 'STD', Angle: 45, Length: 64, Weight: 2.4, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'LR', Size: '150', Rating: 'STD', Angle: 90, Length: 229, Weight: 11.5, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'LR', Size: '150', Rating: 'STD', Angle: 45, Length: 95, Weight: 5.7, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },

  // B16.9 ELBOWS (SR, 90 deg)
  { Component: 'ELBOW', Subtype: 'SR', Size: '50', Rating: 'STD', Angle: 90, Length: 51, Weight: 0.7, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'SR', Size: '100', Rating: 'STD', Angle: 90, Length: 102, Weight: 3.2, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'ELBOW', Subtype: 'SR', Size: '150', Rating: 'STD', Angle: 90, Length: 152, Weight: 7.7, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },

  // B16.9 TEES (Equal)
  { Component: 'TEE', Subtype: 'EQUAL', Size: '50', Rating: 'STD', BranchSize: '50', Length: 128, Weight: 1.3, RunCenterToEnd: 64, BranchCenterToEnd: 64, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'TEE', Subtype: 'EQUAL', Size: '100', Rating: 'STD', BranchSize: '100', Length: 210, Weight: 5.4, RunCenterToEnd: 105, BranchCenterToEnd: 105, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'TEE', Subtype: 'EQUAL', Size: '150', Rating: 'STD', BranchSize: '150', Length: 286, Weight: 13.5, RunCenterToEnd: 143, BranchCenterToEnd: 143, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },

  // B16.9 TEES (Reducing)
  { Component: 'TEE', Subtype: 'REDUCING', Size: '100', Rating: 'STD', BranchSize: '50', Length: 210, Weight: 4.8, RunCenterToEnd: 105, BranchCenterToEnd: 89, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'TEE', Subtype: 'REDUCING', Size: '150', Rating: 'STD', BranchSize: '100', Length: 286, Weight: 11.5, RunCenterToEnd: 143, BranchCenterToEnd: 130, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },

  // B16.5 FLANGES (WN, RF)
  { Component: 'FLANGE', Subtype: 'WN', Size: '50', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 60, Weight: 2.7, Standard: 'B16.5', Source: 'b16.5-seed', DatasetVersion: '1.0' },
  { Component: 'FLANGE', Subtype: 'WN', Size: '100', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 76, Weight: 7.5, Standard: 'B16.5', Source: 'b16.5-seed', DatasetVersion: '1.0' },
  { Component: 'FLANGE', Subtype: 'WN', Size: '150', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 89, Weight: 11.9, Standard: 'B16.5', Source: 'b16.5-seed', DatasetVersion: '1.0' },
  { Component: 'FLANGE', Subtype: 'WN', Size: '50', Rating: '300', Facing: 'RF', EndType: 'FLANGED', Length: 70, Weight: 3.2, Standard: 'B16.5', Source: 'b16.5-seed', DatasetVersion: '1.0' },
  { Component: 'FLANGE', Subtype: 'WN', Size: '100', Rating: '300', Facing: 'RF', EndType: 'FLANGED', Length: 86, Weight: 11.3, Standard: 'B16.5', Source: 'b16.5-seed', DatasetVersion: '1.0' },

  // BALL VALVES (Reduced Bore)
  { Component: 'VALVE', Subtype: 'BALL', Size: '50', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 178, Weight: 8.5, BoreType: 'REDUCED', Source: 'valve-seed', DatasetVersion: '1.0' },
  { Component: 'VALVE', Subtype: 'BALL', Size: '100', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 229, Weight: 25.0, BoreType: 'REDUCED', Source: 'valve-seed', DatasetVersion: '1.0' },
  { Component: 'VALVE', Subtype: 'BALL', Size: '150', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 267, Weight: 45.0, BoreType: 'REDUCED', Source: 'valve-seed', DatasetVersion: '1.0' },

  // OTHER VALVES & REDUCER & SUPPORT (Legacy/Generic)
  { Component: 'VALVE', Subtype: 'GATE', Size: '100', Rating: '150', EndType: 'FLANGED', Length: 292, Weight: 84.5, Source: 'legacy-seed' },
  { Component: 'VALVE', Subtype: 'CHECK', Size: '100', Rating: '150', EndType: 'FLANGED', Length: 229, Weight: 61.4, Source: 'legacy-seed' },
  { Component: 'FLANGE', Subtype: 'SO', Size: '100', Rating: '150', Facing: 'RF', EndType: 'FLANGED', Length: 18, Weight: 7.8, Source: 'legacy-seed' },
  { Component: 'REDUCER', Subtype: 'CONCENTRIC', Size: '150x100', Rating: 'STD', Length: 140, Weight: 4.1, Standard: 'B16.9', Source: 'b16.9-seed', DatasetVersion: '1.0' },
  { Component: 'SUPPORT', Subtype: 'REST', Size: '100', Rating: '', Length: 120, Weight: 6.0, Source: 'legacy-seed' },
]);
