import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('BM1 dashboard panel exposes accessible region metadata', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /BM1_DASHBOARD_TITLE_ID/);
  assert.match(source, /setAttribute\('role', 'region'\)/);
  assert.match(source, /setAttribute\('aria-labelledby', BM1_DASHBOARD_TITLE_ID\)/);
  assert.match(source, /setAttribute\('tabindex', '-1'\)/);
  assert.match(source, /id="\$\{BM1_DASHBOARD_TITLE_ID\}"/);
});

test('BM1 dashboard panel has labelled controls and polite result output', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /aria-label="Collapse or expand BM1 dashboard"/);
  assert.match(source, /aria-label="Hide BM1 dashboard"/);
  assert.match(source, /aria-live="polite"/);
});

test('BM1 dashboard panel supports Escape-to-hide without global key listener', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /const onKeyDown = \(event\) =>/);
  assert.match(source, /event\.key !== 'Escape'/);
  assert.match(source, /event\.preventDefault\?\.\(\)/);
  assert.match(source, /panel\.addEventListener\('keydown', onKeyDown\)/);
  assert.match(source, /panel\.removeEventListener\('keydown', onKeyDown\)/);
  assert.equal(source.includes('document.addEventListener(\'keydown\''), false);
  assert.equal(source.includes('window.addEventListener(\'keydown\''), false);
});

test('BM1 dashboard accessibility does not introduce geometry or renderer behavior', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  for (const forbidden of ['new THREE', 'BufferGeometry', 'CylinderGeometry', 'BoxGeometry', 'fabricatedLength', 'portOffset', 'gasketThickness', 'boltCount', 'createObjectURL']) {
    assert.equal(source.includes(forbidden), false, `BM1 dashboard accessibility must not introduce ${forbidden}`);
  }
});
