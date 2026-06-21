import test from 'node:test';
import assert from 'node:assert/strict';
import { BM1_BREAK_SUPPORT_FIXTURE } from '../benchmarks/bm1-break-support.fixture.js';
import { createRouteEngine } from '../editor/route-engine.js';
import { executeMacro, lintMacroScript, listMacroCommands } from '../macro/macro-engine.js';

const EPS = 0.001;

function pointText(point) {
  return `${point.x},${point.y},${point.z}`;
}

function findNodeAt(route, point) {
  return (route.nodes || []).find((node) => Math.abs(node.x - point.x) <= EPS && Math.abs(node.y - point.y) <= EPS && Math.abs(node.z - point.z) <= EPS) || null;
}

function branchSegment(route) {
  assert.equal(route.segments.length, 1, 'fixture branch route should start with one segment');
  return route.segments[0];
}

function createBranchRoute() {
  const routeEngine = createRouteEngine();
  const fixture = BM1_BREAK_SUPPORT_FIXTURE;
  routeEngine.createPolyline(fixture.branchPoints, fixture.branchSpec, { routeId: fixture.branchRouteId, source: 'bm1-break-support-test' });
  return { routeEngine, fixture, route: routeEngine.getRoutes()[0] };
}

test('BM1 break/support macro commands are registered and lintable', () => {
  const commands = listMacroCommands();
  for (const name of ['BREAK_PIPE', 'PIPE_BREAK', 'SUPPORT_ATTACH', 'ATTACH_SUPPORT']) {
    assert.ok(commands.includes(name), `${name} should be registered as a macro command`);
  }

  const fixture = BM1_BREAK_SUPPORT_FIXTURE;
  const script = [
    `BREAK_PIPE SEGMENT=P6 ${pointText(fixture.supportPoint)} ROUTE=${fixture.branchRouteId}`,
    `SUPPORT_ATTACH ${pointText(fixture.supportPoint)} ROUTE=${fixture.branchRouteId} KIND=${fixture.support.supportType} NAME=${fixture.support.id} ATTACH=${fixture.support.attach}`,
  ].join('\n');
  assert.equal(lintMacroScript(script, { sourceName: 'bm1-break-support' }).ok, true);
});

test('BREAK_PIPE creates a route break node and SUPPORT_ATTACH reuses it', () => {
  const { routeEngine, fixture, route } = createBranchRoute();
  const segmentId = branchSegment(route).id;
  const ctx = { getRouteEngine: () => routeEngine };

  let result = executeMacro(`BREAK_PIPE ${segmentId} ${pointText(fixture.supportPoint)} ROUTE=${fixture.branchRouteId}`, ctx);
  assert.equal(result.kind, 'BREAK_PIPE');
  assert.equal(result.routeId, fixture.branchRouteId);
  assert.equal(result.segmentId, segmentId);
  assert.ok(result.nodeId, 'break should create or resolve a support node');

  const afterBreak = routeEngine.getRoutes()[0];
  assert.equal(afterBreak.nodes.length, 3);
  assert.equal(afterBreak.segments.length, 2);
  const supportNode = findNodeAt(afterBreak, fixture.supportPoint);
  assert.ok(supportNode, 'support point must exist as a route node after BREAK_PIPE');

  result = executeMacro(`SUPPORT_ATTACH ${pointText(fixture.supportPoint)} ROUTE=${fixture.branchRouteId} KIND=${fixture.support.supportType} NAME=${fixture.support.id} ATTACH=${fixture.support.attach}`, ctx);
  assert.equal(result.kind, 'SUPPORT_ATTACH');
  assert.equal(result.nodeId, supportNode.id);
  assert.equal(result.supportId, fixture.support.id);
  assert.equal(result.supportType, fixture.support.supportType);

  const finalRoute = routeEngine.getRoutes()[0];
  assert.equal(finalRoute.nodes.length, 3, 'support attach should reuse the existing break node without splitting again');
  const support = routeEngine.getInlineComponents()[0];
  assert.equal(support.type, 'SUPPORT');
  assert.equal(support.id, fixture.support.id);
  assert.equal(support.metadata.source.nodeId, supportNode.id);
  assert.equal(support.metadata.source.supportType, fixture.support.supportType);
  assert.equal(support.metadata.source.attach, fixture.support.attach);
});

test('SUPPORT_ATTACH creates a break node first when point is not already a node and SEGMENT is supplied', () => {
  const { routeEngine, fixture, route } = createBranchRoute();
  const segmentId = branchSegment(route).id;
  const ctx = { getRouteEngine: () => routeEngine };

  const result = executeMacro(`SUPPORT_ATTACH ${pointText(fixture.supportPoint)} ROUTE=${fixture.branchRouteId} SEGMENT=${segmentId} KIND=${fixture.support.supportType} NAME=${fixture.support.id} ATTACH=${fixture.support.attach}`, ctx);
  assert.equal(result.kind, 'SUPPORT_ATTACH');
  assert.ok(result.nodeId, 'support attach should resolve the created break node');

  const finalRoute = routeEngine.getRoutes()[0];
  assert.equal(finalRoute.nodes.length, 3);
  assert.equal(finalRoute.segments.length, 2);
  assert.ok(findNodeAt(finalRoute, fixture.supportPoint));

  const support = routeEngine.getInlineComponents()[0];
  assert.equal(support.type, 'SUPPORT');
  assert.equal(support.id, fixture.support.id);
  assert.equal(support.metadata.source.segmentId, segmentId);
  assert.equal(support.metadata.source.nodeId, result.nodeId);
});

test('SUPPORT_ATTACH refuses floating supports unless a route node or split segment is provided', () => {
  const { routeEngine, fixture } = createBranchRoute();
  const ctx = { getRouteEngine: () => routeEngine };

  assert.throws(
    () => executeMacro(`SUPPORT_ATTACH ${pointText(fixture.supportPoint)} ROUTE=${fixture.branchRouteId} KIND=REST NAME=PS-001`, ctx),
    /provide SEGMENT=/,
  );
});
