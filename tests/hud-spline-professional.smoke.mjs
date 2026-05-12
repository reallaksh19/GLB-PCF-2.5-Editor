import assert from 'node:assert/strict';
import {
  addSplineAbsolutePoint,
  addSplinePoint,
  clearSplineDraft,
  createSplineDraft,
  finishSplineDraftPayload,
  resolveSplinePointPreview,
  setSplinePreviewPoint,
  setSplineStartPoint,
  splinePointTableRows,
  undoSplinePoint,
  updateSplineDraftField,
} from '../hud/hud-spline-professional.js';

const start = { x: 0, y: 0, z: 0 };

let draft = createSplineDraft();

assert.equal(draft.points.length, 0);
assert.equal(draft.currentPoint, null);
assert.equal(draft.guideType, 'SPLINE');

draft = setSplineStartPoint(draft, start);

assert.equal(draft.points.length, 1);
assert.deepEqual(draft.currentPoint, start);

draft = updateSplineDraftField(draft, 'commandText', 'X1000');
draft = resolveSplinePointPreview(draft);

assert.equal(draft.previewPoint.x, 1000);
assert.equal(draft.previewPoint.y, 0);
assert.equal(draft.previewPoint.z, 0);

draft = addSplinePoint(draft);

assert.equal(draft.points.length, 2);
assert.equal(draft.currentPoint.x, 1000);

draft = updateSplineDraftField(draft, 'commandText', 'Y750');
draft = addSplinePoint(draft);

assert.equal(draft.points.length, 3);
assert.equal(draft.currentPoint.x, 1000);
assert.equal(draft.currentPoint.y, 750);

draft = updateSplineDraftField(draft, 'commandText', '@500<0');
draft = addSplinePoint(draft);

assert.equal(draft.points.length, 4);
assert.equal(draft.currentPoint.x, 1500);
assert.equal(draft.currentPoint.y, 750);

draft = updateSplineDraftField(draft, 'inputMode', 'Relative');
draft = updateSplineDraftField(draft, 'dx', 250);
draft = updateSplineDraftField(draft, 'dy', 100);
draft = updateSplineDraftField(draft, 'dz', 50);

assert.equal(draft.commandText, '@250,100,50');

draft = addSplinePoint(draft);

assert.equal(draft.currentPoint.x, 1750);
assert.equal(draft.currentPoint.y, 850);
assert.equal(draft.currentPoint.z, 50);

draft = setSplinePreviewPoint(draft, { x: 2000, y: 1000, z: 100 });

assert.equal(draft.previewPoint.x, 2000);
assert.equal(draft.previewPoint.y, 1000);
assert.equal(draft.previewPoint.z, 100);

draft = addSplineAbsolutePoint(draft, { x: 2000, y: 1000, z: 100 });

assert.equal(draft.currentPoint.x, 2000);
assert.equal(draft.currentPoint.y, 1000);
assert.equal(draft.currentPoint.z, 100);

let rows = splinePointTableRows(draft);

assert.equal(rows.length, draft.points.length);
assert.equal(rows[0].x, '0.0');
assert.equal(rows.at(-1).z, '100.0');

let payload = finishSplineDraftPayload(draft);

assert.equal(payload.ok, true);
assert.equal(payload.guideType, 'SPLINE');
assert.ok(payload.points.length >= 2);

draft = undoSplinePoint(draft);

assert.equal(draft.points.length, payload.points.length - 1);

draft = clearSplineDraft(draft);

assert.equal(draft.points.length, 0);
assert.equal(draft.currentPoint, null);

const tooShort = finishSplineDraftPayload(createSplineDraft(start));

assert.equal(tooShort.ok, false);
assert.ok(tooShort.errors.length > 0);

const bad = resolveSplinePointPreview({
  ...createSplineDraft(start),
  commandText: 'BADTOKEN',
});

assert.ok(bad.errors.length > 0);

console.log('PASS hud-spline-professional.smoke.mjs');
