import assert from 'node:assert/strict';
import {
  addPolylineAbsolutePoint,
  addPolylineSegment,
  closePolylineDraft,
  createPolylineDraft,
  finishPolylineDraftPayload,
  polylineSegmentTableRows,
  rebuildPolylineDraftFromTokens,
  resolvePolylineSegmentPreview,
  setPolylinePreviewPoint,
  setPolylineStartPoint,
  undoPolylineSegment,
  updatePolylineDraftField,
} from '../hud/hud-polyline-professional.js';

const start = { x: 0, y: 0, z: 0 };

let draft = createPolylineDraft();

assert.equal(draft.points.length, 0);
assert.equal(draft.currentPoint, null);

draft = setPolylineStartPoint(draft, start);

assert.equal(draft.points.length, 1);
assert.deepEqual(draft.currentPoint, start);

draft = updatePolylineDraftField(draft, 'commandText', 'X1000');
draft = resolvePolylineSegmentPreview(draft);

assert.equal(draft.previewPoint.x, 1000);
assert.equal(draft.previewPoint.y, 0);
assert.equal(draft.previewSegment.lengthMm, 1000);

draft = addPolylineSegment(draft);

assert.equal(draft.points.length, 2);
assert.equal(draft.segments.length, 1);
assert.equal(draft.currentPoint.x, 1000);

draft = updatePolylineDraftField(draft, 'commandText', 'Y750');
draft = addPolylineSegment(draft);

assert.equal(draft.points.length, 3);
assert.equal(draft.segments.length, 2);
assert.equal(draft.currentPoint.x, 1000);
assert.equal(draft.currentPoint.y, 750);

draft = updatePolylineDraftField(draft, 'commandText', '@500<0');
draft = addPolylineSegment(draft);

assert.equal(draft.points.length, 4);
assert.equal(draft.segments.length, 3);
assert.equal(draft.currentPoint.x, 1500);
assert.equal(draft.currentPoint.y, 750);

let rows = polylineSegmentTableRows(draft);

assert.equal(rows.length, 3);
assert.equal(rows[0].length, '1000.0');
assert.equal(rows[1].axis, 'Y');
assert.equal(rows[2].method, 'bearing');

draft = undoPolylineSegment(draft);

assert.equal(draft.points.length, 3);
assert.equal(draft.segments.length, 2);
assert.equal(draft.currentPoint.x, 1000);
assert.equal(draft.currentPoint.y, 750);

draft = updatePolylineDraftField(draft, 'inputMode', 'Relative');
draft = updatePolylineDraftField(draft, 'dx', 250);
draft = updatePolylineDraftField(draft, 'dy', 0);
draft = updatePolylineDraftField(draft, 'dz', 0);

assert.equal(draft.commandText, '@250,0,0');

draft = addPolylineSegment(draft);

assert.equal(draft.currentPoint.x, 1250);
assert.equal(draft.currentPoint.y, 750);

draft = setPolylinePreviewPoint(draft, { x: 1500, y: 1000, z: 0 });

assert.equal(draft.previewPoint.x, 1500);
assert.equal(draft.previewPoint.y, 1000);

draft = addPolylineAbsolutePoint(draft, { x: 1500, y: 1000, z: 0 });

assert.equal(draft.currentPoint.x, 1500);
assert.equal(draft.currentPoint.y, 1000);

let closed = closePolylineDraft(draft);

assert.equal(closed.errors.length, 0);
assert.equal(closed.points[closed.points.length - 1].x, closed.points[0].x);
assert.equal(closed.points[closed.points.length - 1].y, closed.points[0].y);
assert.equal(closed.points[closed.points.length - 1].z, closed.points[0].z);

let payload = finishPolylineDraftPayload(closed);

assert.equal(payload.ok, true);
assert.ok(payload.points.length >= 4);
assert.ok(payload.segments.length >= 3);

const rebuilt = rebuildPolylineDraftFromTokens(
  { x: 10, y: 20, z: 30 },
  ['X1000', 'Y500', 'D250'],
  { axis: 'X' }
);

assert.equal(rebuilt.points.length, 4);
assert.equal(rebuilt.segments.length, 3);
assert.equal(rebuilt.currentPoint.x, 1010);
assert.equal(rebuilt.currentPoint.y, 520);
assert.equal(rebuilt.currentPoint.z, -220);

const bad = resolvePolylineSegmentPreview({
  ...createPolylineDraft(start),
  commandText: 'BADTOKEN',
});

assert.ok(bad.errors.length > 0);

const tooShort = finishPolylineDraftPayload(createPolylineDraft(start));

assert.equal(tooShort.ok, false);
assert.ok(tooShort.errors.length > 0);

console.log('PASS hud-polyline-professional.smoke.mjs');
