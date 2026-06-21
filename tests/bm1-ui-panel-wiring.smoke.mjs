import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './bm1-dashboard-panel-controls.smoke.mjs';

test('BM1 UI panel renderer dispatches through BM1 contract and macro engine', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /executeBm1UiHudAction/);
  assert.match(source, /executeMacro/);
  assert.match(source, /getRouteEngine/);
  assert.match(source, /refreshScene/);
  assert.match(source, /data-bm1-action/);
});

test('BM1 UI panel renderer builds real DOM panel but no geometry builder', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /document\.createElement\('section'\)/);
  assert.match(source, /host\.appendChild\(panel\)/);
  for (const forbidden of ['SceneRenderer', 'new THREE', 'BufferGeometry', 'CylinderGeometry', 'BoxGeometry', 'fabricatedLength', 'portOffset', 'gasketThickness', 'boltCount']) {
    assert.equal(source.includes(forbidden), false, `BM1 UI panel must not introduce ${forbidden}`);
  }
});

test('BM1 UI panel is initialized by app bootstrap after viewer shell', () => {
  const source = readFileSync('core/app.js', 'utf8');
  assert.match(source, /import \{ initBm1DashboardPanel \}/);
  assert.match(source, /initViewerTab\(\);\s*\n\s*initBm1Dashboard\(\);/);
  assert.match(source, /hifi-viewer-stage/);
  assert.match(source, /window\.__viewerShell/);
});
