import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_UI_HUD_CONTRACT_VERSION,
  assertBm1UiHudNoGeometryBuilders,
  executeBm1UiHudAction,
  getBm1UiHudContract,
} from '../benchmarks/bm1-ui-hud-command-contract.js';
import { loadBm1FixtureIntoRouteEngine } from '../benchmarks/bm1-runtime-loader.js';
import { createRouteEngine } from '../editor/route-engine.js';
import { executeMacro, listMacroCommands } from '../macro/macro-engine.js';
import './bm1-ui-hud-surface.smoke.mjs';

const BM1_COMMAND_SOURCES = Object.freeze([
  'macro/macro-route-auto-fit-commands.js',
  'macro/macro-route-flange-commands.js',
  'macro/macro-route-break-support-commands.js',
]);

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

function bm1MacroDescriptors() {
  const contract = getBm1UiHudContract();
  return [...contract.dashboardActions, ...contract.hudSteps].filter((item) => item.kind === 'macro');
}

function macroName(macro) {
  return String(macro || '').trim().split(/\s+/)[0].toUpperCase();
}

function createBm1RuntimeRouteEngine() {
  const routeEngine = createRouteEngine();
  loadBm1FixtureIntoRouteEngine(routeEngine);
  return routeEngine;
}

function bm1RuntimeContext(routeEngine) {
  return {
    getRouteEngine: () => routeEngine,
    executeMacro: (line) => executeMacro(line, { getRouteEngine: () => routeEngine }),
  };
}

function executeBm1MacroDescriptor(descriptor) {
  const routeEngine = createBm1RuntimeRouteEngine();
  const ctx = bm1RuntimeContext(routeEngine);
  return { routeEngine, result: executeBm1UiHudAction(descriptor, ctx) };
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
  assert.equal(loaded.runtimeLoaded, false);

  const canonical = executeBm1UiHudAction('bm1.validate');
  assert.equal(canonical.schemaVersion, 'bm-centerline-topology/v1');
  assert.equal(canonical.summary.structuralValid, true);

  const topology = executeBm1UiHudAction('bm1.topology');
  assert.match(topology, /A--P1--B/);
  assert.match(topology, /REST PS-001/);
});

test('BM1 UI/HUD load service creates runtime routes when a route engine is available', () => {
  const routeEngine = createRouteEngine();
  let refreshed = 0;
  const result = executeBm1UiHudAction('bm1.load', {
    getRouteEngine: () => routeEngine,
    refreshScene: () => { refreshed += 1; },
  });

  assert.equal(result.runtimeLoaded, true);
  assert.equal(result.mode, 'created');
  assert.equal(refreshed, 1);
  assert.ok(routeEngine.getRoutes().some((route) => route.id === 'BM1-MAIN-ROUTE'));
  assert.ok(routeEngine.getRoutes().some((route) => route.id === 'BM1-BRANCH-ROUTE'));
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

test('every BM1 UI/HUD macro string has a registered runtime command', () => {
  const registered = new Set(listMacroCommands());
  for (const descriptor of bm1MacroDescriptors()) {
    const name = macroName(descriptor.payload?.macro);
    assert.ok(registered.has(name), `${descriptor.id} macro command ${name} should be registered`);
  }
});

test('BM1 UI/HUD macro actions execute through runtime commands without Unknown command failures', () => {
  for (const descriptor of bm1MacroDescriptors()) {
    assert.doesNotThrow(
      () => executeBm1MacroDescriptor(descriptor),
      `${descriptor.id} should execute without Unknown command or routing failures`,
    );
  }
});

test('BM1 dashboard runtime sequence loads routes before executing macro actions', () => {
  const routeEngine = createRouteEngine();
  const ctx = bm1RuntimeContext(routeEngine);

  assert.doesNotThrow(() => executeBm1UiHudAction('bm1.load', ctx));
  for (const actionId of ['bm1.auto-bend', 'bm1.flange-pair', 'bm1.auto-tee', 'bm1.break-support']) {
    assert.doesNotThrow(() => executeBm1UiHudAction(actionId, ctx), `${actionId} should execute after BM1 load`);
  }

  const componentTypes = routeEngine.getInlineComponents().map((component) => component.type).sort();
  assert.ok(componentTypes.includes('ELBOW'));
  assert.ok(componentTypes.includes('TEE'));
  assert.ok(componentTypes.includes('FLANGE_PAIR'));
  assert.ok(componentTypes.includes('SUPPORT'));
});

test('BM1 FLANGE_PAIR and SUPPORT_ATTACH preserve UI/HUD topology metadata', () => {
  const flangeRun = executeBm1MacroDescriptor(getBm1UiHudContract().dashboardActions.find((item) => item.id === 'bm1.flange-pair'));
  const flange = flangeRun.routeEngine.getInlineComponents().find((item) => item.type === 'FLANGE_PAIR');
  assert.ok(flange, 'FLANGE_PAIR should create an inline topology component');
  assert.equal(flange.attributes.TYPE, 'WN');
  assert.equal(flange.attributes.FACING, 'RF');
  assert.equal(flange.attributes.CLASS, '300');
  assert.equal(flange.attributes.SIZE, '150NB');
  assert.equal(flange.attributes.ROUTE, 'BM1-MAIN-ROUTE');
  assert.equal(flange.attributes.NAME, 'FLG-001');
  assert.equal(flange.attributes.PROVENANCE, 'BM1-HUD');

  const supportRun = executeBm1MacroDescriptor(getBm1UiHudContract().dashboardActions.find((item) => item.id === 'bm1.break-support'));
  const support = supportRun.routeEngine.getInlineComponents().find((item) => item.type === 'SUPPORT');
  assert.ok(support, 'SUPPORT_ATTACH should create an inline topology component');
  assert.equal(support.attributes.ROUTE, 'BM1-BRANCH-ROUTE');
  assert.equal(support.attributes.SEGMENT, 'P6');
  assert.equal(support.attributes.ATTACH, 'BRANCH');
  assert.equal(support.attributes.NAME, 'PS-001');
  assert.equal(support.attributes.KIND, 'REST');
  assert.equal(support.attributes.PROVENANCE, 'BM1-HUD');
});

test('BM1 UI/HUD macro actions do not inject fabricated dimensional fields', () => {
  for (const descriptor of bm1MacroDescriptors()) {
    const macro = descriptor.payload?.macro || '';
    assert.doesNotMatch(macro, /\b(?:LENGTH|WEIGHT|OD|BORE|THK|GASKET|BOLT)=/i, `${descriptor.id} should not inject fabricated dimensions`);
  }

  for (const id of ['bm1.flange-pair', 'bm1.break-support']) {
    const descriptor = [...getBm1UiHudContract().dashboardActions, ...getBm1UiHudContract().hudSteps].find((item) => item.id === id);
    const { routeEngine } = executeBm1MacroDescriptor(descriptor);
    for (const component of routeEngine.getInlineComponents()) {
      assert.equal(component.attributes.LENGTH, '', `${id} should not synthesize component length`);
      assert.equal(component.attributes.WEIGHT, '', `${id} should not synthesize component weight`);
      assert.equal(component.attributes.BRANCH_LENGTH, '', `${id} should not synthesize branch length`);
    }
  }
});

test('BM1 macro route command sources do not import private or mutable PCD runtime paths', () => {
  for (const path of BM1_COMMAND_SOURCES) {
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['vendor/pipe-component-data', 'PipeComponentData', 'pcd-shim', 'private-pcd', 'patchPipeComponentData']) {
      assert.equal(source.includes(forbidden), false, `${path} must not use ${forbidden}`);
    }
  }
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
