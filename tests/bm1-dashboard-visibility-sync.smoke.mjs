import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './bm1-dashboard-accessibility.smoke.mjs';

test('BM1 dashboard panel emits visibility changes for show hide and collapse', () => {
  const panelSource = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(panelSource, /onVisibilityChange/);
  assert.match(panelSource, /const notifyVisibility = \(\) => onVisibilityChange\?\.\(/);
  assert.match(panelSource, /show = \(\) => \{ panel\.classList\.remove\('hidden'\).*notifyVisibility\(\)/s);
  assert.match(panelSource, /hide = \(\) => \{ panel\.classList\.add\('hidden'\).*notifyVisibility\(\)/s);
  assert.match(panelSource, /setCollapsed = \(collapsed\) => \{[\s\S]*notifyVisibility\(\)/);
});

test('BM1 app bootstrap syncs toolbar active state from panel visibility callback', () => {
  const appSource = readFileSync('core/app.js', 'utf8');
  assert.match(appSource, /function syncBm1DashboardToggle\(visible\)/);
  assert.match(appSource, /onVisibilityChange: \(visible\) => syncBm1DashboardToggle\(visible\)/);
  assert.match(appSource, /syncBm1DashboardToggle\(!\(_bm1DashboardApi\?\.isHidden\?\.\(\)\)\)/);
  assert.match(appSource, /syncBm1DashboardToggle\(visible\)/);
});

test('BM1 visibility sync does not introduce geometry or renderer behavior', () => {
  const combined = `${readFileSync('core/app.js', 'utf8')}\n${readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8')}`;
  for (const forbidden of ['new THREE', 'BufferGeometry', 'CylinderGeometry', 'BoxGeometry', 'fabricatedLength', 'portOffset', 'gasketThickness', 'boltCount', 'createObjectURL']) {
    assert.equal(combined.includes(forbidden), false, `BM1 visibility sync must not introduce ${forbidden}`);
  }
});
