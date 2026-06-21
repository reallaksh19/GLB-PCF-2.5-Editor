export const BM1_BREAK_SUPPORT_FIXTURE = Object.freeze({
  id: 'BM1-BREAK-SUPPORT',
  benchmarkId: 'BM1',
  schemaVersion: 'bm-break-support/v1',
  branchRouteId: 'BM1-BRANCH-ROUTE',
  branchSpec: Object.freeze({ pipelineRef: 'BM1-BRANCH', size: '4IN', nominalSize: '4IN', sch: '40', schedule: '40', material: 'CS' }),
  branchPoints: Object.freeze([
    Object.freeze({ x: 1000, y: 3500, z: 700 }),
    Object.freeze({ x: 1000, y: 3500, z: 1560 }),
  ]),
  supportPoint: Object.freeze({ x: 1000, y: 3500, z: 1250 }),
  support: Object.freeze({ id: 'PS-001', supportType: 'REST', attach: 'BRANCH' }),
});
