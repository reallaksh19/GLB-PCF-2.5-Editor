import assert from 'node:assert/strict';
import {
  expandCurveEntityToSegments,
  expandPolylineToSegments,
  expandSplineToSegments,
  hasPolylineBulges,
} from '../formats/dxf/dxf-curve-utils.js';

function length2d(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const bulgedPolyline = {
  type: 'LWPOLYLINE',
  handle: 'BULGE-1',
  vertices: [
    { x: 0, y: 0, z: 0, bulge: 1 },
    { x: 1000, y: 0, z: 0, bulge: 0 },
  ],
};

assert.equal(hasPolylineBulges(bulgedPolyline.vertices), true);
const bulgeSegments = expandPolylineToSegments(bulgedPolyline, { toleranceMm: 25, maxSegmentLengthMm: 500 });
assert.ok(bulgeSegments.length > 1, 'bulge arc must expand into multiple chord segments');
assert.equal(bulgeSegments[0].approximatedFrom, 'BULGE_ARC');
assert.deepEqual(
  { x: bulgeSegments[0].ep1.x, y: bulgeSegments[0].ep1.y, z: bulgeSegments[0].ep1.z },
  { x: 0, y: 0, z: 0 },
  'first chord must preserve exact source start point'
);
const lastBulge = bulgeSegments[bulgeSegments.length - 1];
assert.deepEqual(
  { x: lastBulge.ep2.x, y: lastBulge.ep2.y, z: lastBulge.ep2.z },
  { x: 1000, y: 0, z: 0 },
  'last chord must preserve exact source end point'
);
assert.ok(
  bulgeSegments.some((seg) => Math.abs(seg.ep1.y) > 1e-6 || Math.abs(seg.ep2.y) > 1e-6),
  'bulge expansion must not collapse to a straight X-axis line'
);

const straightPolyline = {
  type: 'POLYLINE',
  handle: 'PLINE-1',
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 1000, y: 0, z: 0 },
    { x: 1000, y: 500, z: 0 },
  ],
};
const straightSegments = expandCurveEntityToSegments(straightPolyline);
assert.equal(straightSegments.length, 2, '3-point straight polyline must remain 2 segments');
assert.ok(straightSegments.every((seg) => !seg.approximatedFrom));
assert.equal(length2d(straightSegments[0].ep1, straightSegments[0].ep2), 1000);

const spline = {
  type: 'SPLINE',
  handle: 'SPL-1',
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 500, y: 250, z: 0 },
    { x: 1000, y: 0, z: 0 },
  ],
};
const splineSegments = expandSplineToSegments(spline, { maxSegmentLengthMm: 250 });
assert.ok(splineSegments.length >= 8, 'spline must sample into multiple visual chords');
assert.ok(splineSegments.every((seg) => seg.approximatedFrom === 'SPLINE_SAMPLE'));
assert.deepEqual(
  { x: splineSegments[0].ep1.x, y: splineSegments[0].ep1.y, z: splineSegments[0].ep1.z },
  { x: 0, y: 0, z: 0 }
);
const lastSpline = splineSegments[splineSegments.length - 1];
assert.deepEqual(
  { x: Math.round(lastSpline.ep2.x), y: Math.round(lastSpline.ep2.y), z: Math.round(lastSpline.ep2.z) },
  { x: 1000, y: 0, z: 0 }
);

console.log('DXF curve utility smoke passed', {
  bulgeChordCount: bulgeSegments.length,
  straightSegmentCount: straightSegments.length,
  splineChordCount: splineSegments.length,
});
