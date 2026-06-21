import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('BM1 dashboard panel exposes a toolbar-safe toggle API', () => {
  const panelSource = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(panelSource, /toggle: toggleVisible/);
  assert.match(panelSource, /isHidden/);
  assert.match(panelSource, /const toggleVisible = \(\) =>/);
  assert.match(panelSource, /if \(isHidden\(\)\) show\(\); else hide\(\)/);
});

test('BM1 dashboard toolbar toggle is injected by app bootstrap', () => {
  const appSource = readFileSync('core/app.js', 'utf8');
  assert.match(appSource, /BM1_DASHBOARD_TOGGLE_ID = 'hifi-btn-bm1-dashboard'/);
  assert.match(appSource, /initBm1DashboardToolbarToggle\(shellApi\)/);
  assert.match(appSource, /document\.createElement\('button'\)/);
  assert.match(appSource, /button\.textContent = 'BM1'/);
  assert.match(appSource, /_bm1DashboardApi\?\.toggle\?\.\(\)/);
  assert.match(appSource, /insertAdjacentElement\('afterend', button\)/);
});

test('BM1 toolbar toggle does not introduce geometry or renderer behavior', () => {
  const appSource = readFileSync('core/app.js', 'utf8');
  const panelSource = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  const combined = `${appSource}\n${panelSource}`;
  for (const forbidden of ['new THREE', 'BufferGeometry', 'CylinderGeometry', 'BoxGeometry', 'fabricatedLength', 'portOffset', 'gasketThickness', 'boltCount', 'createObjectURL']) {
    assert.equal(combined.includes(forbidden), false, `BM1 toolbar toggle must not introduce ${forbidden}`);
  }
});
