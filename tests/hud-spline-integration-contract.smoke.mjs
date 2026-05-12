import assert from 'node:assert/strict';
import fs from 'node:fs';

const orchestrator = fs.readFileSync('hud/hud-orchestrator.js', 'utf8');
const overlay = fs.readFileSync('hud/hud-overlay.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'hud-spline-professional.js',
  'createSplineDraft',
  'addSplineAbsolutePoint',
  'addSplinePoint',
  'undoSplinePoint',
  'clearSplineDraft',
  'finishSplineDraftPayload',
  'setSplinePreviewPoint',
  'updateSplineDraftField',
  'SPLINE_POINT_ADDED',
  'SPLINE_UNDO',
  'SPLINE_CLEAR',
  'SPLINE_COMMIT',
].forEach((text) => mustContain(orchestrator, text, `orchestrator ${text}`));

[
  'splinePointTableRows',
  'pointTable',
  'spline-add',
  'spline-undo',
  'spline-clear',
  'spline-finish',
  'handlers.addSplinePoint',
  'handlers.undoSplinePoint',
  'handlers.clearSpline',
  'handlers.finishSpline',
].forEach((text) => mustContain(overlay, text, `overlay ${text}`));

[
  'test:hud-spline-professional',
  'test:hud-spline-integration',
  'test:slice8',
].forEach((text) => mustContain(pkg, text, `package script ${text}`));

console.log('PASS hud-spline-integration-contract.smoke.mjs');
