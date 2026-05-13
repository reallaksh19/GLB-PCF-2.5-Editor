import assert from 'node:assert/strict';
import {
  formatDerivedMessage,
  formatRouteDetailMessage,
  formatRouteInventoryMessage,
  getRouteInventoryDetail,
  listDerivedRouteComponents,
  listRouteInventory,
  parseRouteInventoryArgs,
  resolveInventoryRouteId,
  routeToInventoryDetail,
  routeToInventorySummary,
} from '../macro/macro-route-inventory.js';

const route = {
  id: 'R-1',
  spec: { pipelineRef: 'P-100' },
  nodes: [
    { id: 'N-1', x: 0, y: 0, z: 0 },
    { id: 'N-2', x: 1000, y: 0, z: 0 },
  ],
  segments: [
    { id: 'S-1', from: 'N-1', to: 'N-2', kind: 'PIPE', orientation: 'X' },
  ],
  components: [
    { id: 'C-1', type: 'VALVE' },
  ],
};

const routeEngine = {
  getState() {
    return { selection: { activeRouteId: 'R-1' } };
  },
  getRoutes() {
    return [route];
  },
  getDerivedComponents() {
    return [
      {
        id: 'route:R-1:seg:S-1',
        type: 'PIPE',
        label: 'PIPE S-1',
        attributes: { ROUTE_ID: 'R-1', SEGMENT_ID: 'S-1' },
      },
      {
        id: 'route:R-2:seg:S-9',
        type: 'PIPE',
        label: 'PIPE S-9',
        attributes: { ROUTE_ID: 'R-2', SEGMENT_ID: 'S-9' },
      },
    ];
  },
};

const parsed = parseRouteInventoryArgs(['ROUTE=R-1', 'DETAIL=1']);

assert.deepEqual(parsed.opts, { ROUTE: 'R-1', DETAIL: '1' });
assert.deepEqual(parsed.values, []);

assert.equal(resolveInventoryRouteId(parsed, routeEngine), 'R-1');
assert.equal(resolveInventoryRouteId({ opts: {}, values: ['R-2'] }, routeEngine), 'R-2');
assert.equal(resolveInventoryRouteId({ opts: {}, values: [] }, routeEngine), 'R-1');

const summary = routeToInventorySummary(route);

assert.deepEqual(summary, {
  id: 'R-1',
  nodeCount: 2,
  segmentCount: 1,
  componentCount: 1,
  spec: { pipelineRef: 'P-100' },
});

const detail = routeToInventoryDetail(route);

assert.equal(detail.nodes.length, 2);
assert.equal(detail.segments.length, 1);
assert.equal(detail.nodes[1].id, 'N-2');
assert.equal(detail.segments[0].id, 'S-1');

const routes = listRouteInventory(routeEngine);

assert.equal(routes.length, 1);
assert.equal(routes[0].id, 'R-1');

const loadedDetail = getRouteInventoryDetail(routeEngine, 'R-1');

assert.equal(loadedDetail.id, 'R-1');
assert.equal(loadedDetail.nodeCount, 2);

const derivedAll = listDerivedRouteComponents(routeEngine);

assert.equal(derivedAll.length, 2);

const derivedR1 = listDerivedRouteComponents(routeEngine, 'R-1');

assert.equal(derivedR1.length, 1);
assert.equal(derivedR1[0].segmentId, 'S-1');

assert.equal(formatRouteInventoryMessage(routes), 'ROUTES: 1 route(s) — R-1 [nodes=2, segments=1]');
assert.equal(formatRouteDetailMessage(detail), 'ROUTE_INFO R-1: 2 node(s), 1 segment(s)');
assert.equal(formatDerivedMessage(derivedR1, 'R-1'), 'ROUTE_DERIVED R-1: 1 component(s)');

assert.throws(
  () => getRouteInventoryDetail(routeEngine, 'NOPE'),
  /Route not found/
);

console.log('PASS macro-route-inventory.smoke.mjs');
