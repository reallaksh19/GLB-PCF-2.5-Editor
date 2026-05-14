import assert from 'node:assert/strict';
import {
  executeMacroScript,
  executeMacroScriptReport,
} from '../macro/macro-engine.js';

function createRouteEngineStub() {
  const routes = [];
  const guides = [];

  return {
    routes,
    guides,
    getState() {
      return {
        selection: {
          activeRouteId: routes[0]?.id || null,
        },
        model: {
          routes,
        },
      };
    },
    getRoutes() {
      return routes;
    },
    getDerivedComponents() {
      return routes.flatMap((route) => (route.segments || []).map((segment) => ({
        id: `route:${route.id}:seg:${segment.id}`,
        type: 'PIPE',
        attributes: {
          ROUTE_ID: route.id,
          SEGMENT_ID: segment.id,
        },
      })));
    },
    createPolyline(points, spec = {}, meta = {}) {
      const routeId = `R-${routes.length + 1}`;
      const nodes = points.map((point, idx) => ({
        id: `N-${routes.length + 1}-${idx + 1}`,
        ...point,
      }));
      const segments = [];

      for (let i = 1; i < nodes.length; i += 1) {
        segments.push({
          id: `S-${routes.length + 1}-${i}`,
          from: nodes[i - 1].id,
          to: nodes[i].id,
          kind: 'PIPE',
        });
      }

      routes.push({
        id: routeId,
        nodes,
        segments,
        components: [],
        spec,
        meta,
      });

      return routeId;
    },
    createGuide(points, guideType, meta = {}) {
      const id = `G-${guides.length + 1}`;
      guides.push({ id, points, guideType, meta });
      return id;
    },
  };
}

const ctx = {
  getRouteEngine: () => createRouteEngineStub(),
};

let report = executeMacroScriptReport(`
LINE START=0,0,0 X1000
ROUTES
BADCOMMAND
LINE START=0,0,0 Y500
`, ctx, {
  stopOnError: false,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
});

assert.equal(report.ok, false);
assert.equal(report.linesTotal, 4);
assert.equal(report.executedCount, 4);
assert.equal(report.successCount, 3);
assert.equal(report.failureCount, 1);
assert.equal(report.results[0].ok, true);
assert.equal(report.results[0].result.routeId, 'R-1');
assert.equal(report.results[1].result.count, 0);
assert.equal(report.results[2].ok, false);
assert.match(report.results[2].error.message, /Unknown command/);
assert.equal(report.results[3].result.routeId, 'R-1');

const ctxStop = {
  getRouteEngine: () => createRouteEngineStub(),
};

report = executeMacroScriptReport(`
LINE START=0,0,0 X1000
BADCOMMAND
LINE START=0,0,0 Y500
`, ctxStop, {
  stopOnError: true,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
});

assert.equal(report.ok, false);
assert.equal(report.linesTotal, 3);
assert.equal(report.executedCount, 2);
assert.equal(report.successCount, 1);
assert.equal(report.failureCount, 1);
assert.equal(report.summary.stoppedOnError, true);

const ctxCompat = {
  getRouteEngine: () => createRouteEngineStub(),
};

const legacyResults = executeMacroScript(`
LINE START=0,0,0 X1000
ROUTES
`, ctxCompat);

assert.equal(legacyResults.length, 2);
assert.equal(legacyResults[0].ok, true);
assert.equal(legacyResults[0].result.routeId, 'R-1');

assert.throws(
  () => executeMacroScript('BADCOMMAND', { getRouteEngine: () => createRouteEngineStub() }),
  /Unknown command/
);

console.log('PASS macro-script-execution.smoke.mjs');
