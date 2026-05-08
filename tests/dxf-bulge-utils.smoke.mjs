import assert from 'node:assert/strict';
import { bulgeToArc, expandPolylineSegments } from '../formats/dxf/dxf-bulge-utils.js';

const ep1 = { x: 0, y: 0, z: 0, bulge: 1 };
const ep2 = { x: 100, y: 0, z: 0 };
const arc = bulgeToArc(ep1, ep2, 1);

assert.ok(arc, 'bulge=1 must produce an arc');
assert.equal(arc.kind, 'ARC');
assert.ok(Math.abs(arc.radius - 50) < 1e-9, `expected radius 50, got ${arc.radius}`);
assert.ok(Math.abs(arc.cp.x - 50) < 1e-9, `expected center x 50, got ${arc.cp.x}`);
assert.ok(Math.abs(arc.cp.y - 0) < 1e-9, `expected center y 0, got ${arc.cp.y}`);
assert.equal(arc.clockwise, false);

const expanded = expandPolylineSegments({
  type: 'LWPOLYLINE',
  handle: 'BULGE1',
  vertices: [
    { x: 0, y: 0, z: 0, bulge: 1 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 100, z: 0 },
  ],
});

assert.equal(expanded.length, 2);
assert.equal(expanded[0].kind, 'ARC');
assert.equal(expanded[1].kind, 'LINE');
assert.equal(expanded[0].segmentIndex, 0);
assert.equal(expanded[1].segmentIndex, 1);

const closed = expandPolylineSegments({
  type: 'LWPOLYLINE',
  closed: true,
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 10, z: 0 },
  ],
});
assert.equal(closed.length, 3, 'closed polyline must include final closing segment');

console.log('DXF bulge utility smoke passed', {
  radius: arc.radius,
  center: arc.cp,
  expanded: expanded.map((seg) => seg.kind),
  closedSegments: closed.length,
});
