import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const contract = fs.readFileSync('js/ui/viewer-ui-contract.js', 'utf8');
const bindings = fs.readFileSync('js/ui/viewer-ui-bindings.js', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'hifi-topbar',
  'hifi-viewer-toolbar',
  'hifi-left-palette',
  'hifi-viewer-stage',
  'hifi-viewer-canvas',
  'hifi-right-viewbar',
  'hifi-inspector-shell',
  'hifi-macro-tray',
  'hifi-statusbar',
].forEach((id) => mustContain(html, `id="${id}"`, id));

[
  'hifi-canvas-active-pill',
  'hifi-canvas-view-badge',
  'hifi-canvas-snapbar',
  'hifi-cursor-coord',
  'hifi-snap-mode',
  'hifi-active-profile',
].forEach((id) => mustContain(html, `id="${id}"`, id));

['Draw', 'Insert', 'Modify', 'Convert'].forEach((label) => {
  mustContain(html, label, `left palette group ${label}`);
});

[
  'data-view="iso-ne"',
  'data-view="iso-nw"',
  'data-view="iso-se"',
  'data-view="iso-sw"',
  'data-view="plan"',
  'data-view="front"',
  'data-view="right"',
].forEach((attr) => mustContain(html, attr, attr));

[
  'hifi-btn-snap-toggle',
  'hifi-btn-layer-toggle',
  'hifi-btn-lock-view',
  'hifi-btn-view-cube',
].forEach((id) => mustContain(html, `id="${id}"`, id));

[
  'activeToolPill',
  'viewBadge',
  'snapBar',
  'cursorCoord',
  'snapMode',
  'activeProfile',
  'snapToggle',
  'layerToggle',
  'lockView',
  'viewCube',
].forEach((key) => mustContain(contract, key, `contract key ${key}`));

[
  'updateCanvasOverlays',
  'toggleSnap',
  'toggleLayers',
  'toggleViewLock',
  'setCursorPoint',
].forEach((key) => mustContain(bindings, key, `binding ${key}`));

mustContain(html, 'Draft 2D', 'Draft 2D label');
mustContain(html, 'Line diagram', 'Line diagram label');
mustContain(html, 'Solid 3D', 'Solid 3D label');

console.log('PASS hifi-layout-contract.smoke.mjs');
