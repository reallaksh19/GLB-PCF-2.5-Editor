import assert from 'node:assert/strict';
import {
  findRouteTargetKind,
  parseMacroRouteKv,
  parseRouteDeltaToken,
  routeEditResult,
  routeIdFromOptsOrActive,
  routeSnapshot,
} from '../macro/macro-route-edit-results.js';

const parsed = parseMacroRouteKv(['N-1', '100,0,0', 'ROUTE=R-1', 'AXIS=Z']);

assert.deepEqual(parsed.opts, {
  ROUTE: 'R-1',
  AXIS: 'Z',
});
assert.deepEqual(parsed.values, ['N-1', '100,0,0']);

assert.deepEqual(parseRouteDeltaToken('100,200,-50'), {
  x: 100,
  y: 200,
  z: -50,
  dx: 100,
  dy: 200,
  dz: -50,
});

assert.deepEqual(parseRouteDeltaToken('@1,2,3'), {
  x: 1,
  y: 2,
  z: 3,
  dx: 1,
  dy: 2,
  dz: 3,
});

const routeEngine = {
  getState() {
    return { selection: { activeRouteId: 'ACTIVE-R' } };
  },
};

assert.equal(routeIdFromOptsOrActive(routeEngine, {}, 'MOVE'), 'ACTIVE-R');
assert.equal(routeIdFromOptsOrActive(routeEngine, { ROUTE: 'R-2' }, 'MOVE'), 'R-2');

const route = {
  id: 'R-1',
  nodes: [{ id: 'N-1' }],
  segments: [{ id: 'S-1' }],
  components: [{ id: 'C-1' }],
};

assert.equal(findRouteTargetKind(route, 'S-1'), 'segment');
assert.equal(findRouteTargetKind(route, 'N-1'), 'node');
assert.equal(findRouteTargetKind(route, 'R-1'), 'route');

assert.deepEqual(routeSnapshot(route), {
  id: 'R-1',
  nodeCount: 1,
  segmentCount: 1,
  componentCount: 1,
});

assert.deepEqual(routeEditResult('MOVE', {
  routeId: 'R-1',
  nodeId: 'N-1',
  delta: { dx: 1, dy: 2, dz: 3 },
}), {
  message: 'MOVE applied',
  kind: 'MOVE',
  routeId: 'R-1',
  nodeId: 'N-1',
  nodeIds: null,
  segmentId: null,
  targetId: null,
  delta: { dx: 1, dy: 2, dz: 3 },
  pivot: null,
  angle: null,
  axis: null,
  point: null,
  routeSnapshot: null,
});

console.log('PASS macro-route-edit-results.smoke.mjs');
