import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('BM1 dashboard exposes inline action help region', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /BM1_DASHBOARD_HELP_ID/);
  assert.match(source, /data-bm1-inline-help/);
  assert.match(source, /Focus or hover a BM1 action/);
  assert.match(source, /aria-live="polite"/);
});

test('BM1 dashboard action buttons describe help region and carry help text', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /data-bm1-help/);
  assert.match(source, /aria-describedby="\$\{BM1_DASHBOARD_HELP_ID\}"/);
  assert.match(source, /helpForAction\(action\)/);
  assert.match(source, /BM1_ACTION_HELP/);
});

test('BM1 dashboard updates inline help on focus and pointer hover', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /const onPreview = \(event\) =>/);
  assert.match(source, /writeHelp\(panel, button\.getAttribute\('data-bm1-action'\), button\.getAttribute\('data-bm1-help'\)\)/);
  assert.match(source, /panel\.addEventListener\('focusin', onPreview\)/);
  assert.match(source, /panel\.addEventListener\('pointerover', onPreview\)/);
  assert.match(source, /panel\.removeEventListener\('focusin', onPreview\)/);
  assert.match(source, /panel\.removeEventListener\('pointerover', onPreview\)/);
});

test('BM1 dashboard inline help does not introduce geometry or renderer behavior', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  for (const forbidden of ['new THREE', 'BufferGeometry', 'CylinderGeometry', 'BoxGeometry', 'fabricatedLength', 'portOffset', 'gasketThickness', 'boltCount', 'createObjectURL']) {
    assert.equal(source.includes(forbidden), false, `BM1 dashboard help must not introduce ${forbidden}`);
  }
});
