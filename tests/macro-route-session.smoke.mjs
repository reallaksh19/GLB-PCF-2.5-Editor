import assert from 'node:assert/strict';
import {
  assertRouteExists,
  clearMacroActiveRouteId,
  clearMacroRoute,
  currentMacroRoute,
  getMacroActiveRouteId,
  parseRouteSessionArgs,
  resolveRouteSessionId,
  setMacroActiveRouteId,
  useMacroRoute,
} from '../macro/macro-route-session.js';

const route = {
  id: 'R-1',
  nodes: [{ id: 'N-1' }, { id: 'N-2' }],
  segments: [{ id: 'S-1' }],
};

const routeEngine = {
  getState() {
    return { selection: { activeRouteId: 'R-ACTIVE' } };
  },
  getRoutes() {
    return [route, { id: 'R-ACTIVE', nodes: [], segments: [] }];
  },
};

const ctx = {
  getRouteEngine: () => routeEngine,
};

let parsed = parseRouteSessionArgs(['ROUTE=R-1', 'X']);

assert.deepEqual(parsed.opts, { ROUTE: 'R-1' });
assert.deepEqual(parsed.values, ['X']);

assert.equal(getMacroActiveRouteId(ctx), null);
assert.equal(setMacroActiveRouteId(ctx, 'R-1'), 'R-1');
assert.equal(getMacroActiveRouteId(ctx), 'R-1');

clearMacroActiveRouteId(ctx);

assert.equal(getMacroActiveRouteId(ctx), null);
assert.equal(resolveRouteSessionId([], ctx, routeEngine), 'R-ACTIVE');
assert.equal(resolveRouteSessionId(['R-1'], ctx, routeEngine), 'R-1');

assert.equal(assertRouteExists(routeEngine, 'R-1').id, 'R-1');
assert.throws(() => assertRouteExists(routeEngine, 'NOPE'), /Route not found/);

let result = useMacroRoute(['R-1'], ctx);

assert.equal(result.activeRouteId, 'R-1');
assert.equal(ctx.activeRouteId, 'R-1');
assert.equal(ctx.macroActiveRouteId, 'R-1');

result = currentMacroRoute(ctx);

assert.equal(result.activeRouteId, 'R-1');
assert.match(result.message, /CURRENT_ROUTE R-1/);

result = clearMacroRoute(ctx);

assert.equal(result.activeRouteId, null);
assert.equal(ctx.activeRouteId, null);
assert.equal(ctx.macroActiveRouteId, null);

console.log('PASS macro-route-session.smoke.mjs');
