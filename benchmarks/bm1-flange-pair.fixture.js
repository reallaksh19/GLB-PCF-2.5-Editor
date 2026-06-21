export const BM1_FLANGE_PAIR_FIXTURE = Object.freeze({
  id: 'BM1-FLANGE-PAIR',
  benchmarkId: 'BM1',
  schemaVersion: 'bm-flange-pair/v1',
  mainRouteId: 'BM1-MAIN-ROUTE',
  mainSpec: Object.freeze({ pipelineRef: 'BM1-MAIN', size: '150NB', nominalSize: '150NB', sch: '40', schedule: '40', rating: '300', class: '300', material: 'CS' }),
  mainPoints: Object.freeze([
    Object.freeze({ x: 0, y: 0, z: 0 }),
    Object.freeze({ x: 0, y: 1000, z: 0 }),
    Object.freeze({ x: 1000, y: 1000, z: 0 }),
    Object.freeze({ x: 1000, y: 2200, z: 0 }),
  ]),
  flangePoint: Object.freeze({ x: 1000, y: 1000, z: 0 }),
  flange: Object.freeze({ id: 'FLG-001', flangeType: 'WN', facing: 'RF', class: '300', size: '150NB' }),
});
