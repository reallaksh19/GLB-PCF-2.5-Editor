import assert from 'node:assert/strict';
import {
  buildRouteRenderSnapshot,
  diffRouteRenderSnapshot,
  isRouteDerivedComponent,
  stableComponentFingerprint,
  summarizeRouteRenderDiff,
} from '../js/renderer/route-render-reconciler.js';

function routeComp(id, ep2x = 1000) {
  return {
    id,
    type: 'PIPE',
    label: `PIPE ${id}`,
    geometry: {
      ep1: { x: 0, y: 0, z: 0 },
      ep2: { x: ep2x, y: 0, z: 0 },
      origin: { x: ep2x / 2, y: 0, z: 0 },
      bore: 100,
    },
    attributes: {
      SOURCE: 'route-engine',
      ROUTE_ID: 'R-1',
      SEGMENT_ID: id,
    },
    metadata: {
      source: {
        routeId: 'R-1',
        segmentId: id,
      },
    },
  };
}

function staticComp(id) {
  return {
    id,
    type: 'VALVE',
    geometry: {
      origin: { x: 0, y: 0, z: 0 },
    },
    attributes: {},
    metadata: {},
  };
}

assert.equal(isRouteDerivedComponent(routeComp('route:R-1:seg:S1')), true);
assert.equal(isRouteDerivedComponent(staticComp('VALVE-001')), false);

const fpA = stableComponentFingerprint(routeComp('route:R-1:seg:S1', 1000));
const fpB = stableComponentFingerprint(routeComp('route:R-1:seg:S1', 1000));
const fpC = stableComponentFingerprint(routeComp('route:R-1:seg:S1', 1500));

assert.equal(fpA, fpB);
assert.notEqual(fpA, fpC);

const initial = [
  routeComp('route:R-1:seg:S1', 1000),
  routeComp('route:R-1:seg:S2', 2000),
  staticComp('VALVE-001'),
];

const snapshot = buildRouteRenderSnapshot(initial);

assert.equal(snapshot.size, 2);
assert.equal(snapshot.has('route:R-1:seg:S1'), true);
assert.equal(snapshot.has('VALVE-001'), false);

let diff = diffRouteRenderSnapshot(snapshot, [
  routeComp('route:R-1:seg:S1', 1000),
  routeComp('route:R-1:seg:S2', 2000),
]);

assert.equal(diff.changed, false);
assert.deepEqual(summarizeRouteRenderDiff(diff), {
  added: 0,
  updated: 0,
  removed: 0,
  changed: false,
});

diff = diffRouteRenderSnapshot(snapshot, [
  routeComp('route:R-1:seg:S1', 1500), // updated
  routeComp('route:R-1:seg:S3', 3000), // added
]);

assert.equal(diff.changed, true);
assert.equal(diff.added.length, 1);
assert.equal(diff.updated.length, 1);
assert.deepEqual(diff.removedIds, ['route:R-1:seg:S2']);

assert.deepEqual(summarizeRouteRenderDiff(diff), {
  added: 1,
  updated: 1,
  removed: 1,
  changed: true,
});

console.log('PASS route-render-reconciler.smoke.mjs');