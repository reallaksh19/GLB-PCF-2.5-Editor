import assert from 'node:assert/strict';
import { normalizeDxfEntity, getDxfEntityIssue } from '../formats/dxf/dxf-entity-normalizer.js';
import { dxfToCeg } from '../formats/dxf/dxf-to-ceg.js';

const polyline = normalizeDxfEntity({
  type: 'POLYLINE',
  handle: 'P100',
  layer: 'PIPE-RUN-A',
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 50, z: 0 },
  ],
}, 7);

assert.equal(polyline.type, 'POLYLINE');
assert.equal(polyline.vertices.length, 3);
assert.equal(getDxfEntityIssue(polyline), null);

const invalidPolyline = normalizeDxfEntity({
  type: 'POLYLINE',
  handle: 'BAD',
  layer: 'PIPE-RUN-A',
  vertices: [{ x: 0, y: 0, z: 0 }],
}, 8);
assert.equal(getDxfEntityIssue(invalidPolyline), 'POLYLINE_NEEDS_AT_LEAST_TWO_VERTICES');

const ceg = dxfToCeg({
  lines: [],
  arcs: [],
  texts: [],
  inserts: [],
  circles: [],
  unsupported: [],
  polylines: [{
    type: 'POLYLINE',
    handle: 'P100',
    layer: 'PIPE-RUN-A',
    vertices: polyline.vertices,
    closed: false,
  }],
});

const components = Object.values(ceg.components);
const anchors = Object.values(ceg.anchors);

assert.equal(components.length, 2, '3-vertex POLYLINE must become 2 editable line components');
assert.equal(anchors.length, 4, 'each downgraded segment must have EP1 and EP2 anchors');
assert.equal(ceg.lossContract.downgradedEntities.length, 1);
assert.equal(ceg.lossContract.proxyEntities.length, 0);
assert.deepEqual(
  components.map((c) => c.sourceRef.segmentIndex),
  [0, 1],
  'segment indices must preserve source ordering for round-trip diagnostics'
);
assert.ok(
  components.every((c) => c.sourceRef.downgradedFrom === 'POLYLINE'),
  'CEG components must retain original DXF entity type'
);

console.log('DXF polyline structural smoke passed', {
  components: components.length,
  anchors: anchors.length,
  downgraded: ceg.lossContract.downgradedEntities.length,
});
