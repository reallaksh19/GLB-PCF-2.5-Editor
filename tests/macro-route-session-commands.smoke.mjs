import assert from 'node:assert/strict';
import { executeMacro } from '../macro/macro-engine.js';

function createRouteEngineStub() {
  const calls = [];
  const routes = [
    {
      id: 'R-1',
      nodes: [{ id: 'N-1' }, { id: 'N-2' }],
      segments: [{ id: 'S-1', from: 'N-1', to: 'N-2' }],
      components: [],
    },
    {
      id: 'R-2',
      nodes: [{ id: 'N-3' }, { id: 'N-4' }],
      segments: [{ id: 'S-2', from: 'N-3', to: 'N-4' }],
      components: [],
    },
  ];

  return {
    calls,
    getState() {
      return { selection: { activeRouteId: null }, model: { routes } };
    },
    getRoutes() {
      return routes;
    },
    getDerivedComponents() {
      return [
        { id: 'route:R-1:seg:S-1', type: 'PIPE', attributes: { ROUTE_ID: 'R-1', SEGMENT_ID: 'S-1' } },
        { id: 'route:R-2:seg:S-2', type: 'PIPE', attributes: { ROUTE_ID: 'R-2', SEGMENT_ID: 'S-2' } },
      ];
    },
    moveNode(routeId, nodeId, delta, meta) {
      calls.push({ op: 'moveNode', routeId, nodeId, delta, meta });
    },
    breakSegment(routeId, segmentId, point, meta) {
      calls.push({ op: 'breakSegment', routeId, segmentId, point, meta });
    },
    execute(command) {
      calls.push({ op: 'execute', command });
    },
  };
}

const routeEngine = createRouteEngineStub();

const ctx = {
  getRouteEngine: () => routeEngine,
};

let result = executeMacro('USE_ROUTE R-2', ctx);

assert.equal(result.activeRouteId, 'R-2');
assert.equal(ctx.activeRouteId, 'R-2');
assert.equal(ctx.macroActiveRouteId, 'R-2');

result = executeMacro('CURRENT_ROUTE', ctx);

assert.equal(result.activeRouteId, 'R-2');
assert.equal(result.routeId, 'R-2');

result = executeMacro('ROUTE_INFO', ctx);

assert.equal(result.routeId, 'R-2');
assert.equal(result.route.id, 'R-2');

result = executeMacro('ROUTE_DERIVED', ctx);

assert.equal(result.routeId, 'R-2');
assert.equal(result.components[0].segmentId, 'S-2');

result = executeMacro('MOVE N-3 100,0,0', ctx);

assert.equal(result.kind, 'MOVE');
assert.equal(result.routeId, 'R-2');
assert.equal(routeEngine.calls.at(-1).op, 'moveNode');
assert.equal(routeEngine.calls.at(-1).routeId, 'R-2');

result = executeMacro('BREAK S-2 0,250,0', ctx);

assert.equal(result.kind, 'BREAK');
assert.equal(result.routeId, 'R-2');
assert.equal(routeEngine.calls.at(-1).op, 'breakSegment');
assert.equal(routeEngine.calls.at(-1).routeId, 'R-2');

result = executeMacro('CLEAR_ROUTE', ctx);

assert.equal(result.activeRouteId, null);
assert.equal(ctx.activeRouteId, null);
assert.equal(ctx.macroActiveRouteId, null);

assert.throws(
  () => executeMacro('USE_ROUTE NOPE', ctx),
  /Route not found/
);

console.log('PASS macro-route-session-commands.smoke.mjs');
