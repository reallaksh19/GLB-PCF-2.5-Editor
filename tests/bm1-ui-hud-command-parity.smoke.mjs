import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_UI_HUD_CONTRACT_VERSION,
  assertBm1UiHudNoGeometryBuilders,
  executeBm1UiHudAction,
  getBm1UiHudContract,
} from '../benchmarks/bm1-ui-hud-command-contract.js';
import './bm1-ui-hud-surface.smoke.mjs';

function makeRouteEngineSpy() {
  const calls = [];
  const routes = [{
    id: 'BM1-MAIN-ROUTE',
    nodes: [
      { id: 'nC', x: 1000, y: 1000, z: 0 },
      { id: 'nD', x: 1000, y: 2200, z: 0 },
    ],
    segments: [{ id: 'seg-cd', from: 'nC', to: 'nD' }],
  }];
  return {
    calls,
    startRoute(point, spec, meta) { calls.push({ method: 'startRoute', point, spec, meta }); return meta.routeId; },
    addToPoint(routeId, point, meta) { calls.push({ method: 'addToPoint', routeId, point, meta }); return null; },
    breakSegment(routeId, segmentId, point, meta) { calls.push({ method: 'breakSegment', routeId, segmentId, point, meta }); return null; },
    getRoutes: () => routes,
  };
}

test('BM1 UI/HUD contract exposes dashboard and HUD action groups without geometry builders', () => {
  const contract = getBm1UiHudContract();
  assert.equal(contract.version, BM1_UI_HUD_CONTRACT_VERSION);
  assert.ok(contract.dashboardActions.length >= 8);
  assert.ok(contract.hudSteps.length >= 15);
  assert.equal(assertBm1UiHudNoGeometryBuilders(contract), true);

  const ids = new Set([...contract.dashboardActions, ...contract.hudSteps].map((item) => item.id));
  for (const id of ['bm1.load', 'bm1.validate', 'bm1.auto-bend', 'bm1.auto-tee', 'bm1.flange-pair', 'bm1.break-support', 'hud.start-main', 'hud.break-m', 'hud.support-s']) {
    assert.ok(ids.has(id), `${id} should exist in the BM1 UI/HUD contract`);
  }
});

test('BM1 UI/HUD service actions call benchmark services, not UI state or geometry builders', () => {
  const loaded = executeBm1UiHudAction('bm1.load');
  assert.equal(loaded.id, 'BM1');

  const canonical = executeBm1UiHudAction('bm1.validate');
  assert.equal(canonical.schemaVersion, 'bm-centerline-topology/v1');
  assert.equal(canonical.summary.structuralValid, true);

  const topology = executeBm1UiHudAction('bm1.topology');
  assert.match(topology, /A--P1--B/);
  assert.match(topology, /REST PS-001/);
});

test('BM1 UI/HUD macro actions delegate to macro execution payloads', () => {
  const macros = [];
  const ctx = { executeMacro: (line) => { macros.push(line); return { line }; } };

  executeBm1UiHudAction('bm1.auto-bend', ctx);
  executeBm1UiHudAction('bm1.auto-tee', ctx);
  executeBm1UiHudAction('bm1.flange-pair', ctx);
  executeBm1UiHudAction('bm1.break-support', ctx);

  assert.deepEqual(macros, [
    'AUTO_BEND ROUTE=BM1-MAIN-ROUTE SUBTYPE=LR END_TYPE=BW SIZE=150NB CLASS=300 PROVENANCE=BM1-HUD',
    'AUTO_TEE ROUTE=BM1-MAIN-ROUTE SUBTYPE=REDUCING END_TYPE=BW SIZE=150NB BRANCH_SIZE=4IN CLASS=300 PROVENANCE=BM1-HUD',
    'FLANGE_PAIR 1000,1000,0 ROUTE=BM1-MAIN-ROUTE TYPE=WN FACING=RF CLASS=300 SIZE=150NB NAME=FLG-001 PROVENANCE=BM1-HUD',
    'SUPPORT_ATTACH 1000,3500,1250 ROUTE=BM1-BRANCH-ROUTE SEGMENT=P6 KIND=REST NAME=PS-001 ATTACH=BRANCH PROVENANCE=BM1-HUD',
  ]);
});

test('BM1 HUD route actions dispatch to route engine services only', () => {
  const routeEngine = makeRouteEngineSpy();
  const ctx = { getRouteEngine: () => routeEngine };

  executeBm1UiHudAction('hud.start-main', ctx);
  executeBm1UiHudAction('hud.add-b', ctx);
  executeBm1UiHudAction('hud.break-m', ctx);

  assert.equal(routeEngine.calls[0].method, 'startRoute');
  assert.equal(routeEngine.calls[0].meta.routeId, 'BM1-MAIN-ROUTE');
  assert.deepEqual(routeEngine.calls[0].point, { x: 0, y: 0, z: 0 });
  assert.deepEqual(routeEngine.calls[0].spec, {});

  assert.equal(routeEngine.calls[1].method, 'addToPoint');
  assert.equal(routeEngine.calls[1].routeId, 'BM1-MAIN-ROUTE');
  assert.deepEqual(routeEngine.calls[1].point, { x: 0, y: 1000, z: 0 });

  assert.equal(routeEngine.calls[2].method, 'breakSegment');
  assert.equal(routeEngine.calls[2].routeId, 'BM1-MAIN-ROUTE');
  assert.equal(routeEngine.calls[2].segmentId, 'seg-cd');
  assert.deepEqual(routeEngine.calls[2].point, { x: 1000, y: 1600, z: 0 });
});

test('BM1 UI/HUD command contract stays browser-independent', () => {
  const source = readFileSync('benchmarks/bm1-ui-hud-command-contract.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'querySelector', 'addEventListener']) {
    assert.equal(source.includes(forbidden), false, `contract must not depend on ${forbidden}`);
  }
});
