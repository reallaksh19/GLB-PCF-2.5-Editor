import assert from 'node:assert/strict';
import {
  buildLineCommandFromDraft,
  buildRepeatLineDraft,
  lineDraftSummary,
  resolveLineDraftPreview,
  safeResolveLineDraftPreview,
  updateLineDraftField,
} from '../hud/hud-line-professional.js';

const anchor = { x: 100, y: 200, z: 300 };

let draft = resolveLineDraftPreview({
  anchorPoint: anchor,
  axis: 'X',
  sign: 1,
  lengthMm: 1000,
});

assert.equal(draft.commandText, 'X1000');
assert.equal(draft.previewPoint.x, 1100);
assert.equal(draft.previewPoint.y, 200);
assert.equal(draft.previewPoint.z, 300);
assert.equal(draft.inputMode, 'Length');
assert.equal(draft.lastParsed.mode, 'axis');

draft = updateLineDraftField(draft, 'axis', 'Y');
draft = updateLineDraftField(draft, 'lengthMm', 750);

assert.equal(draft.commandText, 'Y750');
assert.equal(draft.previewPoint.x, 100);
assert.equal(draft.previewPoint.y, 950);
assert.equal(draft.previewPoint.z, 300);

draft = updateLineDraftField(draft, 'sign', -1);

assert.equal(draft.commandText, 'Y-750');
assert.equal(draft.previewPoint.y, -550);
assert.equal(draft.sign, -1);

draft = updateLineDraftField(draft, 'commandText', '@1000,200,50');

assert.equal(draft.inputMode, 'Relative');
assert.equal(draft.previewPoint.x, 1100);
assert.equal(draft.previewPoint.y, 400);
assert.equal(draft.previewPoint.z, 350);
assert.equal(draft.dx, 1000);
assert.equal(draft.dy, 200);
assert.equal(draft.dz, 50);

draft = updateLineDraftField({
  anchorPoint: anchor,
  axis: 'X',
  sign: 1,
  lengthMm: 1000,
}, 'commandText', '@1000<90');

assert.equal(draft.inputMode, 'Bearing');
assert.ok(Math.abs(draft.previewPoint.x - 100) < 1e-6);
assert.equal(Math.round(draft.previewPoint.y), 1200);
assert.equal(draft.previewPoint.z, 300);
assert.equal(draft.angleDeg, 90);

draft = updateLineDraftField({
  anchorPoint: anchor,
  axis: 'X',
}, 'commandText', '2000,2500,400');

assert.equal(draft.inputMode, 'Absolute');
assert.equal(draft.previewPoint.x, 2000);
assert.equal(draft.previewPoint.y, 2500);
assert.equal(draft.previewPoint.z, 400);

draft = updateLineDraftField({
  anchorPoint: anchor,
  axis: 'X',
}, 'commandText', 'R500');

assert.equal(draft.inputMode, 'Length');
assert.equal(draft.axis, 'Z');
assert.equal(draft.sign, 1);
assert.equal(draft.previewPoint.z, 800);

draft = updateLineDraftField({
  anchorPoint: anchor,
  axis: 'X',
}, 'commandText', 'D250');

assert.equal(draft.axis, 'Z');
assert.equal(draft.sign, -1);
assert.equal(draft.previewPoint.z, 50);

const noAnchor = safeResolveLineDraftPreview({
  anchorPoint: null,
  axis: 'X',
  sign: 1,
  lengthMm: 1000,
});

assert.equal(noAnchor.previewPoint, null);
assert.deepEqual(noAnchor.errors, []);

const bad = safeResolveLineDraftPreview({
  anchorPoint: anchor,
  commandText: 'BADTOKEN',
});

assert.ok(bad.errors.length > 0);

assert.equal(buildLineCommandFromDraft({
  anchorPoint: anchor,
  inputMode: 'Length',
  axis: 'X',
  sign: -1,
  lengthMm: 1234,
}), 'X-1234');

assert.equal(buildLineCommandFromDraft({
  anchorPoint: anchor,
  inputMode: 'Relative',
  dx: 10,
  dy: 20,
  dz: 30,
}), '@10,20,30');

assert.equal(buildLineCommandFromDraft({
  anchorPoint: anchor,
  inputMode: 'Absolute',
  dx: 10,
  dy: 20,
  dz: 30,
}), '110,220,330');

assert.equal(buildLineCommandFromDraft({
  anchorPoint: anchor,
  inputMode: 'Bearing',
  lengthMm: 500,
  angleDeg: 45,
}), '@500<45');

const repeated = buildRepeatLineDraft({
  anchorPoint: anchor,
  axis: 'X',
  sign: 1,
  lengthMm: 10,
}, 1500);

assert.equal(repeated.commandText, 'X1500');
assert.equal(repeated.previewPoint.x, 1600);

const summary = lineDraftSummary(repeated);

assert.equal(summary.inputMode, 'Length');
assert.equal(summary.commandText, 'X1500');
assert.equal(summary.axis, 'X');
assert.equal(summary.lengthMm, 1500);
assert.equal(summary.previewPoint.x, 1600);
assert.deepEqual(summary.errors, []);

console.log('PASS hud-line-professional.smoke.mjs');
