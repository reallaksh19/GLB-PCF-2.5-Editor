import test from 'node:test';
import assert from 'node:assert/strict';
import { BM1_FLANGE_PAIR_FIXTURE } from '../benchmarks/bm1-flange-pair.fixture.js';
import { createRouteEngine } from '../editor/route-engine.js';
import { executeMacro, lintMacroScript, listMacroCommands } from '../macro/macro-engine.js';

const EPS = 0.001;

function pointText(point) {
  return `${point.x},${point.y},${point.z}`;
}

function findNodeAt(route, point) {
  return (route.nodes || []).find((node) => Math.abs(node.x - point.x) <= EPS && Math.abs(node.y - point.y) <= EPS && Math.abs(node.z - point.z) <= EPS) || null;
}

function routeCenterlineSnapshot(route) {
  return {
    nodes: route.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, z: node.z })),
    segments: route.segments.map((segment) => ({ id: segment.id, from: segment.from, to: segment.to, kind: segment.kind, orientation: segment.orientation })),
  };
}

function createMainRoute() {
  const routeEngine = createRouteEngine();
  const fixture = BM1_FLANGE_PAIR_FIXTURE;
  routeEngine.createPolyline(fixture.mainPoints, fixture.mainSpec, { routeId: fixture.mainRouteId, source: 'bm1-flange-pair-test' });
  return { routeEngine, fixture, route: routeEngine.getRoutes()[0] };
}

test('BM1 FLANGE_PAIR macro command is registered and lintable', () => {
  const commands = listMacroCommands();
  for (const name of ['FLANGE_PAIR', 'FLANGEPAIR']) {
    assert.ok(commands.includes(name), `${name} should be registered as a macro command`);
  }

  const fixture = BM1_FLANGE_PAIR_FIXTURE;
  const script = `FLANGE_PAIR ${pointText(fixture.flangePoint)} ROUTE=${fixture.mainRouteId} TYPE=${fixture.flange.flangeType} FACING=${fixture.flange.facing} CLASS=${fixture.flange.class} SIZE=${fixture.flange.size} NAME=${fixture.flange.id}`;
  assert.equal(lintMacroScript(script, { sourceName: 'bm1-flange-pair' }).ok, true);
});

test('FLANGE_PAIR inserts an inline centerline component without shifting route coordinates', () => {
  const { routeEngine, fixture, route } = createMainRoute();
  const ctx = { getRouteEngine: () => routeEngine };
  const node = findNodeAt(route, fixture.flangePoint);
  assert.ok(node, 'fixture flange point must map to an existing route node');
  const before = routeCenterlineSnapshot(route);

  const result = executeMacro(`FLANGE_PAIR ${pointText(fixture.flangePoint)} ROUTE=${fixture.mainRouteId} TYPE=${fixture.flange.flangeType} FACING=${fixture.flange.facing} CLASS=${fixture.flange.class} SIZE=${fixture.flange.size} NAME=${fixture.flange.id}`, ctx);
  assert.equal(result.kind, 'FLANGE_PAIR');
  assert.equal(result.routeId, fixture.mainRouteId);
  assert.equal(result.nodeId, node.id);
  assert.equal(result.flangeId, fixture.flange.id);

  const after = routeCenterlineSnapshot(routeEngine.getRoutes()[0]);
  assert.deepEqual(after, before, 'FLANGE_PAIR must not shift downstream centerline coordinates in CENTERLINE mode');

  const flangePair = routeEngine.getInlineComponents()[0];
  assert.equal(flangePair.type, 'FLANGE_PAIR');
  assert.equal(flangePair.id, fixture.flange.id);
  assert.equal(flangePair.attributes.SUBTYPE, fixture.flange.flangeType);
  assert.equal(flangePair.attributes.FACING, fixture.flange.facing);
  assert.equal(flangePair.attributes.RATING, fixture.flange.class);
  assert.equal(flangePair.attributes.SIZE, fixture.flange.size);
  assert.equal(flangePair.metadata.source.nodeId, node.id);
});

test('FLANGE_PAIR supports NODE=... and rejects non-node centerline points', () => {
  const { routeEngine, fixture, route } = createMainRoute();
  const ctx = { getRouteEngine: () => routeEngine };
  const node = findNodeAt(route, fixture.flangePoint);

  const result = executeMacro(`FLANGEPAIR NODE=${node.id} ROUTE=${fixture.mainRouteId} TYPE=WN FACING=RF CLASS=300 SIZE=150NB NAME=FLG-NODE`, ctx);
  assert.equal(result.kind, 'FLANGE_PAIR');
  assert.equal(result.nodeId, node.id);

  assert.throws(
    () => executeMacro(`FLANGE_PAIR 1000,1600,0 ROUTE=${fixture.mainRouteId} TYPE=WN FACING=RF CLASS=300 SIZE=150NB`, ctx),
    /must match an existing route node/,
  );
});
