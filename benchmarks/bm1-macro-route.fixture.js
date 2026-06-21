export const BM1_MACRO_ROUTE_FIXTURE = Object.freeze({
  id: 'BM1-MACRO-ROUTE',
  benchmarkId: 'BM1',
  schemaVersion: 'bm-macro-route/v1',
  mainRouteId: 'BM1-MAIN-ROUTE',
  branchRouteId: 'BM1-BRANCH-ROUTE',
  specs: Object.freeze({
    main: Object.freeze({ pipelineRef: 'BM1-MAIN', size: '150NB', nominalSize: '150NB', sch: '40', schedule: '40', rating: '300', class: '300', material: 'CS' }),
    branch: Object.freeze({ pipelineRef: 'BM1-BRANCH', size: '4IN', nominalSize: '4IN', sch: '40', schedule: '40', material: 'CS' }),
  }),
  routes: Object.freeze({
    main: Object.freeze([
      Object.freeze({ x: 0, y: 0, z: 0 }),
      Object.freeze({ x: 0, y: 1000, z: 0 }),
      Object.freeze({ x: 1000, y: 1000, z: 0 }),
      Object.freeze({ x: 1000, y: 2200, z: 0 }),
      Object.freeze({ x: 1000, y: 3500, z: 0 }),
    ]),
    branch: Object.freeze([
      Object.freeze({ x: 1000, y: 3500, z: 0 }),
      Object.freeze({ x: 1000, y: 3500, z: 700 }),
      Object.freeze({ x: 1000, y: 3500, z: 1560 }),
    ]),
  }),
  macroCommands: Object.freeze([
    'AUTO_BEND ROUTE=BM1-MAIN-ROUTE SUBTYPE=LR END_TYPE=BW SIZE=150NB CLASS=300 ANGLE=90 PROVENANCE=BM1-MACRO',
    'AUTO_TEE ROUTE=BM1-MAIN-ROUTE SUBTYPE=REDUCING END_TYPE=BW SIZE=150NB BRANCH_SIZE=4IN CLASS=300 PROVENANCE=BM1-MACRO',
  ]),
});
