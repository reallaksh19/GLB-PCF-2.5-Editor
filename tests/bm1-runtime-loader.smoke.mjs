import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BM1_CENTERLINE_FIXTURE } from '../benchmarks/bm1-centerline.fixture.js';
import { buildBm1RouteDefinitions, loadBm1FixtureIntoRouteEngine } from '../benchmarks/bm1-runtime-loader.js';
import { createRouteEngine } from '../editor/route-engine.js';

const FORBIDDEN_DIMENSION_KEYS = Object.freeze(['OD', 'BORE', 'THK', 'LENGTH', 'WEIGHT', 'GASKET', 'BOLT']);

function routeById(routeEngine, routeId) {
  return routeEngine.getRoutes().find((route) => route.id === routeId) || null;
}

function routePoints(route) {
  return (route?.nodes || []).map((node) => ({ x: node.x, y: node.y, z: node.z }));
}

function fixturePoints(nodeIds) {
  return nodeIds.map((id) => {
    const node = BM1_CENTERLINE_FIXTURE.nodes.find((item) => item.id === id);
    assert.ok(node, `fixture node ${id} should exist`);
    return { x: node.x, y: node.y, z: node.z };
  });
}

function assertNoFabricatedDimensions(value, label) {
  const keys = Object.keys(value || {}).map((key) => key.toUpperCase());
  for (const key of FORBIDDEN_DIMENSION_KEYS) {
    assert.equal(keys.includes(key), false, `${label} should not include fabricated ${key}`);
  }
}

test('BM1 runtime loader derives route definitions from the centerline fixture', () => {
  const defs = buildBm1RouteDefinitions(BM1_CENTERLINE_FIXTURE);
  assert.deepEqual(defs.map((route) => route.id), ['BM1-MAIN-ROUTE', 'BM1-BRANCH-ROUTE']);
  assert.deepEqual(defs[0].pointIds, ['A', 'B', 'C', 'M', 'D', 'E']);
  assert.deepEqual(defs[1].pointIds, ['E', 'F', 'S', 'G']);
});

test('loadBm1FixtureIntoRouteEngine creates BM1 main and branch runtime routes', () => {
  const routeEngine = createRouteEngine();
  const result = loadBm1FixtureIntoRouteEngine(routeEngine, BM1_CENTERLINE_FIXTURE);

  assert.equal(result.runtimeLoaded, true);
  assert.equal(result.mode, 'created');
  assert.deepEqual(result.routeIds, ['BM1-MAIN-ROUTE', 'BM1-BRANCH-ROUTE']);

  const mainRoute = routeById(routeEngine, 'BM1-MAIN-ROUTE');
  const branchRoute = routeById(routeEngine, 'BM1-BRANCH-ROUTE');
  assert.ok(mainRoute, 'BM1-MAIN-ROUTE should be created');
  assert.ok(branchRoute, 'BM1-BRANCH-ROUTE should be created');

  assert.deepEqual(routePoints(mainRoute), fixturePoints(['A', 'B', 'C', 'M', 'D', 'E']));
  assert.deepEqual(routePoints(branchRoute), fixturePoints(['E', 'F', 'S', 'G']));
});

test('BM1 runtime loader preserves route specs from fixture data', () => {
  const routeEngine = createRouteEngine();
  loadBm1FixtureIntoRouteEngine(routeEngine, BM1_CENTERLINE_FIXTURE);

  const mainSpec = routeById(routeEngine, 'BM1-MAIN-ROUTE').spec;
  assert.equal(mainSpec.size, '150NB');
  assert.equal(mainSpec.nominalSize, '150NB');
  assert.equal(mainSpec.class, '300');
  assert.equal(mainSpec.rating, '300');
  assert.equal(mainSpec.material, 'CS');
  assert.equal(mainSpec.standard, 'ASME');

  const branchSpec = routeById(routeEngine, 'BM1-BRANCH-ROUTE').spec;
  assert.equal(branchSpec.size, '4IN');
  assert.equal(branchSpec.nominalSize, '4IN');
  assert.equal(branchSpec.sch, '40');
  assert.equal(branchSpec.schedule, '40');
  assert.equal(branchSpec.material, 'CS');
  assert.equal(branchSpec.standard, 'ASME');

  assertNoFabricatedDimensions(mainSpec, 'main route spec');
  assertNoFabricatedDimensions(branchSpec, 'branch route spec');
});

test('BM1 runtime loader is idempotent and does not delete unrelated routes', () => {
  const routeEngine = createRouteEngine();
  routeEngine.createPolyline([{ x: -10, y: 0, z: 0 }, { x: -10, y: 100, z: 0 }], { size: 'USER' }, { routeId: 'USER-ROUTE', source: 'test' });

  const first = loadBm1FixtureIntoRouteEngine(routeEngine, BM1_CENTERLINE_FIXTURE);
  routeEngine.insertComponent({ id: 'BM1-COMPONENT-CHECK', component: 'FLANGE_PAIR', routeId: 'BM1-MAIN-ROUTE', point: { x: 1000, y: 1000, z: 0 }, provenance: 'test' }, { source: 'test' });
  const second = loadBm1FixtureIntoRouteEngine(routeEngine, BM1_CENTERLINE_FIXTURE);

  assert.equal(first.mode, 'created');
  assert.equal(second.mode, 'existing');
  assert.equal(routeEngine.getRoutes().filter((route) => route.id === 'BM1-MAIN-ROUTE').length, 1);
  assert.equal(routeEngine.getRoutes().filter((route) => route.id === 'BM1-BRANCH-ROUTE').length, 1);
  assert.equal(routeEngine.getRoutes().filter((route) => route.id === 'USER-ROUTE').length, 1);
  assert.equal(routeEngine.getInlineComponents().filter((component) => component.id === 'BM1-COMPONENT-CHECK').length, 1);
});

test('BM1 runtime loader replaces stale BM1 routes without removing unrelated routes', () => {
  const routeEngine = createRouteEngine();
  routeEngine.createPolyline([{ x: 0, y: 0, z: 0 }, { x: 999, y: 999, z: 0 }], { size: 'STALE' }, { routeId: 'BM1-MAIN-ROUTE', source: 'test' });
  routeEngine.createPolyline([{ x: 5, y: 5, z: 5 }, { x: 6, y: 6, z: 6 }], { size: 'USER' }, { routeId: 'USER-ROUTE', source: 'test' });

  const result = loadBm1FixtureIntoRouteEngine(routeEngine, BM1_CENTERLINE_FIXTURE);

  assert.equal(result.mode, 'recreated');
  assert.equal(routeEngine.getRoutes().filter((route) => route.id === 'BM1-MAIN-ROUTE').length, 1);
  assert.equal(routeEngine.getRoutes().filter((route) => route.id === 'BM1-BRANCH-ROUTE').length, 1);
  assert.equal(routeEngine.getRoutes().filter((route) => route.id === 'USER-ROUTE').length, 1);
  assert.deepEqual(routePoints(routeById(routeEngine, 'BM1-MAIN-ROUTE')), fixturePoints(['A', 'B', 'C', 'M', 'D', 'E']));
});

test('BM1 runtime loader remains browser and renderer independent', () => {
  const source = readFileSync('benchmarks/bm1-runtime-loader.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'querySelector', 'addEventListener', 'THREE', 'WebGLRenderer', 'MeshStandardMaterial', 'BufferGeometry']) {
    assert.equal(source.includes(forbidden), false, `loader must not depend on ${forbidden}`);
  }
});
