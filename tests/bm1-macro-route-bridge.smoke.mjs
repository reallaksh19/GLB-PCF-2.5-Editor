import test from 'node:test';
import assert from 'node:assert/strict';
import { BM1_MACRO_ROUTE_FIXTURE } from '../benchmarks/bm1-macro-route.fixture.js';
import { createRouteEngine } from '../editor/route-engine.js';
import { executeMacro, lintMacroScript, listMacroCommands } from '../macro/macro-engine.js';

function componentTypes(routeEngine) {
  return (routeEngine.getState().model?.components || []).map((component) => component.type).sort();
}

function componentByType(routeEngine, type) {
  return (routeEngine.getState().model?.components || []).find((component) => component.type === type) || null;
}

test('BM1 macro route auto-fit commands are registered and lintable', () => {
  const commands = listMacroCommands();
  for (const name of ['AUTO_BEND', 'AUTOBEND', 'AUTO_TEE', 'AUTOTEE']) {
    assert.ok(commands.includes(name), `${name} should be registered as a macro command`);
  }

  const lint = lintMacroScript(BM1_MACRO_ROUTE_FIXTURE.macroCommands.join('\n'), { sourceName: 'bm1-macro-route-bridge' });
  assert.equal(lint.ok, true);
});

test('BM1 macro AUTO_BEND and AUTO_TEE dispatch through the real route engine', () => {
  const routeEngine = createRouteEngine();
  const ctx = { getRouteEngine: () => routeEngine };
  const fixture = BM1_MACRO_ROUTE_FIXTURE;

  routeEngine.createPolyline(fixture.routes.main, fixture.specs.main, { routeId: fixture.mainRouteId, source: 'bm1-macro-route-test' });
  routeEngine.createPolyline(fixture.routes.branch, fixture.specs.branch, { routeId: fixture.branchRouteId, source: 'bm1-macro-route-test' });

  let result = executeMacro(fixture.macroCommands[0], ctx);
  assert.equal(result.kind, 'AUTO_BEND');
  assert.equal(result.routeId, fixture.mainRouteId);
  assert.ok(result.componentCount >= 1);
  assert.ok(componentTypes(routeEngine).includes('ELBOW'));
  const elbow = componentByType(routeEngine, 'ELBOW');
  assert.equal(elbow.attributes.SUBTYPE, 'LR');
  assert.equal(elbow.attributes.SIZE, '150NB');
  assert.equal(elbow.attributes.PROVENANCE, 'BM1-MACRO');

  result = executeMacro(fixture.macroCommands[1], ctx);
  assert.equal(result.kind, 'AUTO_TEE');
  assert.equal(result.routeId, fixture.mainRouteId);
  assert.ok(result.componentCount >= 2);
  assert.deepEqual(componentTypes(routeEngine), ['ELBOW', 'TEE']);
  const tee = componentByType(routeEngine, 'TEE');
  assert.equal(tee.attributes.SUBTYPE, 'REDUCING');
  assert.equal(tee.attributes.SIZE, '150NB');
  assert.equal(tee.attributes.BRANCH_SIZE, '4IN');
  assert.equal(tee.attributes.BRANCH_ROUTE_ID, fixture.branchRouteId);
});

test('macro auto-fit aliases dispatch to route engine without separate geometry builders', () => {
  const calls = [];
  const route = { id: 'R-1', nodes: [{ id: 'N-1' }, { id: 'N-2' }, { id: 'N-3' }], segments: [] };
  const routeEngine = {
    getState: () => ({ selection: { activeRouteId: 'R-1' }, model: { routes: [route], components: [] } }),
    getRoutes: () => [route],
    autoBend(payload, meta) { calls.push({ op: 'autoBend', payload, meta }); return []; },
    autoTee(payload, meta) { calls.push({ op: 'autoTee', payload, meta }); return []; },
  };
  const ctx = { getRouteEngine: () => routeEngine };

  executeMacro('AUTOBEND N-2 ROUTE=R-1 SUBTYPE=LR SIZE=150NB CLASS=300', ctx);
  executeMacro('AUTOTEE NODE=N-2 ROUTE=R-1 SUBTYPE=REDUCING BRANCH_SIZE=4IN', ctx);

  assert.equal(calls[0].op, 'autoBend');
  assert.equal(calls[0].payload.routeId, 'R-1');
  assert.equal(calls[0].payload.nodeId, 'N-2');
  assert.equal(calls[0].payload.subtype, 'LR');
  assert.equal(calls[0].payload.size, '150NB');
  assert.equal(calls[0].payload.rating, '300');
  assert.equal(calls[0].meta.source, 'macro-auto-bend');

  assert.equal(calls[1].op, 'autoTee');
  assert.equal(calls[1].payload.routeId, 'R-1');
  assert.equal(calls[1].payload.nodeId, 'N-2');
  assert.equal(calls[1].payload.subtype, 'REDUCING');
  assert.equal(calls[1].payload.branchSize, '4IN');
  assert.equal(calls[1].meta.source, 'macro-auto-tee');
});
