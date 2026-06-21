export const BM1_PIPE_LIST_FIXTURE = Object.freeze({
  id: 'BM1-PIPE-LIST',
  benchmarkId: 'BM1',
  schemaVersion: 'bm-explicit-pipe-list/v1',
  mode: 'CENTERLINE',
  units: 'MM',
  specs: Object.freeze([
    Object.freeze({ id: 'MAIN', size: '150NB', sch: '40', class: '300', material: 'CS', standard: 'ASME' }),
    Object.freeze({ id: 'BRANCH', size: '4IN', sch: '40', material: 'CS', standard: 'ASME' }),
  ]),
  pipes: Object.freeze([
    Object.freeze({ id: 'P1', from: Object.freeze({ id: 'A', x: 0, y: 0, z: 0 }), to: Object.freeze({ id: 'B', x: 0, y: 1000, z: 0 }), spec: 'MAIN' }),
    Object.freeze({ id: 'P2', from: Object.freeze({ id: 'B', x: 0, y: 1000, z: 0 }), to: Object.freeze({ id: 'C', x: 1000, y: 1000, z: 0 }), spec: 'MAIN' }),
    Object.freeze({ id: 'P3', from: Object.freeze({ id: 'C', x: 1000, y: 1000, z: 0 }), to: Object.freeze({ id: 'D', x: 1000, y: 2200, z: 0 }), spec: 'MAIN' }),
    Object.freeze({ id: 'P4', from: Object.freeze({ id: 'D', x: 1000, y: 2200, z: 0 }), to: Object.freeze({ id: 'E', x: 1000, y: 3500, z: 0 }), spec: 'MAIN' }),
    Object.freeze({ id: 'P5', from: Object.freeze({ id: 'E', x: 1000, y: 3500, z: 0 }), to: Object.freeze({ id: 'F', x: 1000, y: 3500, z: 700 }), spec: 'BRANCH' }),
    Object.freeze({ id: 'P6', from: Object.freeze({ id: 'F', x: 1000, y: 3500, z: 700 }), to: Object.freeze({ id: 'G', x: 1000, y: 3500, z: 1560 }), spec: 'BRANCH' }),
  ]),
  additionalNodes: Object.freeze([
    Object.freeze({ id: 'M', x: 1000, y: 1600, z: 0 }),
    Object.freeze({ id: 'S', x: 1000, y: 3500, z: 1250 }),
  ]),
  features: Object.freeze([
    Object.freeze({ id: 'ELB-001', type: 'AUTO_BEND_CANDIDATE', at: 'B', angle: 90, subtype: 'LR', endType: 'BW', spec: 'MAIN' }),
    Object.freeze({ id: 'FLG-001', type: 'FLANGE_PAIR', at: 'C', flangeType: 'WN', facing: 'RF', class: '300', spec: 'MAIN' }),
    Object.freeze({ id: 'BRK-001', type: 'BREAK', at: 'M', onSegment: 'P3', method: 'FLANGE_PAIR' }),
    Object.freeze({ id: 'TEE-001', type: 'AUTO_TEE_CANDIDATE', at: 'E', runSpec: 'MAIN', branchSpec: 'BRANCH', subtype: 'REDUCING', endType: 'BW' }),
    Object.freeze({ id: 'BRK-002', type: 'BREAK', at: 'S', onSegment: 'P6' }),
  ]),
  supports: Object.freeze([
    Object.freeze({ id: 'PS-001', type: 'SUPPORT', supportType: 'REST', at: 'S', attach: 'BRANCH' }),
  ]),
});
