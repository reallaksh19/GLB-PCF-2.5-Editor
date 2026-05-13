import assert from 'node:assert/strict';
import { executeMacro } from '../macro/macro-engine.js';

function createRouteEngineStub() {
  const calls = [];
  const route = {
    id: 'R-1',
    nodes: [{ id: 'N-1' }, { id: 'N-2' }],
    segments: [{ id: 'S-1', from: 'N-1', to: 'N-2' }],
    components: [],
  };

  return {
    calls,
    getState() {
      return { selection: { activeRouteId: route.id }, model: { routes: [route] } };
    },
    getRoutes() {
      return [route];
    },
    moveNode(routeId, nodeId, delta, meta) {
      calls.push({ op: 'moveNode', routeId, nodeId, delta, meta });
    },
    stretchNode(routeId, nodeId, delta, meta) {
      calls.push({ op: 'stretchNode', routeId, nodeId, delta, meta });
    },
    rotateNodes(routeId, pivot, angle, axis, nodeIds, meta) {
      calls.push({ op: 'rotateNodes', routeId, pivot, angle, axis, nodeIds, meta });
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
  workingOrigin: { x: 0, y: 0, z: 0 },
  lastPoint: null,
};

let result = executeMacro('MOVE N-1 100,0,0 ROUTE=R-1', ctx);

assert.equal(result.kind, 'MOVE');
assert.equal(result.routeId, 'R-1');
assert.equal(result.nodeId, 'N-1');
assert.equal(routeEngine.calls.at(-1).op, 'moveNode');
assert.deepEqual(routeEngine.calls.at(-1).delta, {
  x: 100, y: 0, z: 0, dx: 100, dy: 0, dz: 0,
});

result = executeMacro('STRETCH N-2 0,250,0', ctx);

assert.equal(result.kind, 'STRETCH');
assert.equal(result.routeId, 'R-1');
assert.equal(result.nodeId, 'N-2');
assert.equal(routeEngine.calls.at(-1).op, 'stretchNode');

result = executeMacro('ROTATE N-1,N-2 90 0,0,0 AXIS=Z ROUTE=R-1', ctx);

assert.equal(result.kind, 'ROTATE');
assert.equal(result.routeId, 'R-1');
assert.deepEqual(result.nodeIds, ['N-1', 'N-2']);
assert.equal(result.angle, 90);
assert.equal(result.axis, 'Z');
assert.equal(routeEngine.calls.at(-1).op, 'rotateNodes');

result = executeMacro('BREAK S-1 500,0,0 ROUTE=R-1', ctx);

assert.equal(result.kind, 'BREAK');
assert.equal(result.routeId, 'R-1');
assert.equal(result.segmentId, 'S-1');
assert.equal(routeEngine.calls.at(-1).op, 'breakSegment');

result = executeMacro('DELETE S-1 ROUTE=R-1', ctx);

assert.equal(result.kind, 'DELETE');
assert.equal(result.routeId, 'R-1');
assert.equal(result.targetId, 'S-1');
assert.equal(routeEngine.calls.at(-1).op, 'execute');
assert.equal(routeEngine.calls.at(-1).command.payload.segmentId, 'S-1');

result = executeMacro('DELETE N-1 ROUTE=R-1', ctx);

assert.equal(result.kind, 'DELETE');
assert.equal(routeEngine.calls.at(-1).command.payload.nodeId, 'N-1');

console.log('PASS macro-route-edit-commands.smoke.mjs');
