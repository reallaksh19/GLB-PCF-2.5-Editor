import assert from 'node:assert/strict';
import { executeMacro } from '../macro/macro-engine.js';

function createStubRouteEngine() {
  const routes = [];
  const guides = [];

  return {
    routes,
    guides,
    createPolyline(points, spec = {}, meta = {}) {
      const routeId = `ROUTE-${routes.length + 1}`;
      const segments = [];

      for (let i = 1; i < points.length; i += 1) {
        segments.push({
          id: `${routeId}-SEG-${i}`,
          ep1: points[i - 1],
          ep2: points[i],
        });
      }

      routes.push({
        id: routeId,
        points: points.map((p) => ({ ...p })),
        segments,
        spec,
        meta,
      });

      return routeId;
    },
    createGuide(points, guideType, meta = {}) {
      const id = `GUIDE-${guides.length + 1}`;
      guides.push({
        id,
        guideType,
        points: points.map((p) => ({ ...p })),
        meta,
      });
      return id;
    },
    getRoutes() {
      return routes;
    },
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
  };
}

const engine = createStubRouteEngine();

const ctx = {
  workingOrigin: { x: 0, y: 0, z: 0 },
  lastPoint: null,
  pipeline: 'P-MACRO',
  defaultOD: 168.3,
  defaultMat: 'CS',
  getRouteEngine: () => engine,
};

let result = executeMacro('LINE START=0,0,0 X1000 PIPELINE=P-001', ctx);

assert.equal(result.routeId, 'ROUTE-1');
assert.equal(engine.routes[0].points.length, 2);
assert.deepEqual(engine.routes[0].points[1], { x: 1000, y: 0, z: 0 });
assert.equal(engine.routes[0].spec.pipelineRef, 'P-001');
assert.equal(engine.routes[0].meta.source, 'macro-line');

result = executeMacro('LINE START=0,0,0 @1000<90', ctx);

assert.equal(result.routeId, 'ROUTE-2');
assert.ok(Math.abs(engine.routes[1].points[1].x - 0) < 1e-6);
assert.equal(Math.round(engine.routes[1].points[1].y), 1000);

result = executeMacro('POLYLINE START=0,0,0 X1000 Y750 D250 PIPELINE=P-002', ctx);

assert.equal(result.routeId, 'ROUTE-3');
assert.equal(engine.routes[2].points.length, 4);
assert.deepEqual(engine.routes[2].points[3], { x: 1000, y: 750, z: -250 });
assert.equal(engine.routes[2].spec.pipelineRef, 'P-002');
assert.equal(engine.routes[2].segments.length, 3);

result = executeMacro('SPLINE_GUIDE START=0,0,0 X500 Y300 @250<0 PIPELINE=P-003', ctx);

assert.equal(result.guideId, 'GUIDE-1');
assert.equal(engine.guides[0].guideType, 'SPLINE');
assert.equal(engine.guides[0].points.length, 4);
assert.equal(engine.guides[0].meta.source, 'macro-spline-guide');
assert.equal(engine.guides[0].meta.pipelineRef, 'P-003');

result = executeMacro('SPLINE START=0,0,0 X250 Y250', ctx);

assert.equal(result.guideId, 'GUIDE-2');
assert.equal(engine.guides[1].guideType, 'SPLINE');
assert.equal(engine.guides[1].points.length, 3);

assert.throws(
  () => executeMacro('LINE START=0,0,0 BADTOKEN', ctx),
  /Draft command parse failed/
);

console.log('PASS macro-line-polyline-spline.smoke.mjs');
