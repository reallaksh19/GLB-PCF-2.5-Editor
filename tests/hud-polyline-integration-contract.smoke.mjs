import assert from 'node:assert/strict';
import fs from 'node:fs';

const orchestrator = fs.readFileSync('hud/hud-orchestrator.js', 'utf8');
const overlay = fs.readFileSync('hud/hud-overlay.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'hud-polyline-professional.js',
  'createPolylineDraft',
  'addPolylineAbsolutePoint',
  'addPolylineSegment',
  'undoPolylineSegment',
  'closePolylineDraft',
  'finishPolylineDraftPayload',
  'setPolylinePreviewPoint',
  'updatePolylineDraftField',
  'POLYLINE_SEGMENT_ADDED',
  'POLYLINE_UNDO',
  'POLYLINE_CLOSE',
  'POLYLINE_COMMIT',
].forEach((text) => mustContain(orchestrator, text, `orchestrator ${text}`));

[
  'polylineSegmentTableRows',
  'segmentTable',
  'poly-add',
  'poly-undo',
  'poly-close',
  'poly-finish',
  'handlers.addPolylineSegment',
  'handlers.undoPolylineSegment',
  'handlers.closePolyline',
  'handlers.finishPolyline',
].forEach((text) => mustContain(overlay, text, `overlay ${text}`));

[
  'test:hud-polyline-professional',
  'test:hud-polyline-integration',
  'test:slice7',
].forEach((text) => mustContain(pkg, text, `package script ${text}`));

console.log('PASS hud-polyline-integration-contract.smoke.mjs');
