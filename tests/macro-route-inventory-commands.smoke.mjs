import assert from 'node:assert/strict';
import { executeMacro } from '../macro/macro-engine.js';

function createRouteEngineStub() {
  const routes = [
    {
      id: 'R-1',
      spec: { pipelineRef: 'P-100' },
      nodes: [
        { id: 'N-1', x: 0, y: 0, z: 0 },
        { id: 'N-2', x: 1000, y: 0, z: 0 },
      ],
      segments: [
        { id: 'S-1', from: 'N-1', to: 'N-2', kind: 'PIPE', orientation: 'X' },
      ],
      components: [],
    },
    {
      id: 'R-2',
      spec: { pipelineRef: 'P-200' },
      nodes: [
        { id: 'N-3', x: 0, y: 0, z: 0 },
        { id: 'N-4', x: 0, y: 500, z: 0 },
      ],
      segments: [
        { id: 'S-2', from: 'N-3', to: 'N-4', kind: 'PIPE', orientation: 'Y' },
      ],
      components: [],
    },
  ];

  return {
    getState() {
      return { selection: { activeRouteId: 'R-1' }, model: { routes } };
    },
    getRoutes() {
      return routes;
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
          id: 'route:R-2:seg:S-2',
          type: 'PIPE',
          label: 'PIPE S-2',
          attributes: { ROUTE_ID: 'R-2', SEGMENT_ID: 'S-2' },
        },
      ];
    },
  };
}

const routeEngine = createRouteEngineStub();

const ctx = {
  getRouteEngine: () => routeEngine,
};

let result = executeMacro('ROUTES', ctx);

assert.equal(result.count, 2);
assert.equal(result.routes[0].id, 'R-1');
assert.equal(result.routes[1].id, 'R-2');
assert.match(result.message, /ROUTES: 2 route/);

result = executeMacro('ROUTE_INFO ROUTE=R-1', ctx);

assert.equal(result.routeId, 'R-1');
assert.equal(result.route.id, 'R-1');
assert.equal(result.route.nodes.length, 2);
assert.equal(result.route.segments[0].id, 'S-1');

result = executeMacro('ROUTE_INFO R-2', ctx);

assert.equal(result.routeId, 'R-2');
assert.equal(result.route.id, 'R-2');
assert.equal(result.route.segments[0].orientation, 'Y');

result = executeMacro('ROUTE_DERIVED ROUTE=R-1', ctx);

assert.equal(result.routeId, 'R-1');
assert.equal(result.count, 1);
assert.equal(result.components[0].id, 'route:R-1:seg:S-1');
assert.equal(result.components[0].segmentId, 'S-1');

result = executeMacro('ROUTE_DERIVED', ctx);

assert.equal(result.routeId, 'R-1');
assert.equal(result.count, 1);

assert.throws(
  () => executeMacro('ROUTE_INFO ROUTE=NOPE', ctx),
  /Route not found/
);

console.log('PASS macro-route-inventory-commands.smoke.mjs');
