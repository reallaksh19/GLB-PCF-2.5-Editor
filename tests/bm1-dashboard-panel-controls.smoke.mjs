import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('BM1 dashboard panel exposes collapse and close controls', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /data-bm1-panel-toggle/);
  assert.match(source, /data-bm1-panel-close/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /collapse: \(\) => setCollapsed\(true\)/);
  assert.match(source, /expand: \(\) => setCollapsed\(false\)/);
  assert.match(source, /show: \(\) => panel\.classList\.remove\('hidden'\)/);
  assert.match(source, /hide: \(\) => panel\.classList\.add\('hidden'\)/);
});

test('BM1 dashboard panel ignores action buttons while collapsed', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  assert.match(source, /panel\.classList\.contains\('collapsed'\)/);
  assert.match(source, /if \(!button \|\| panel\.classList\.contains\('collapsed'\)\) return/);
});

test('BM1 dashboard panel controls do not add geometry or renderer behavior', () => {
  const source = readFileSync('js/ui/bm1-dashboard-panel.js', 'utf8');
  for (const forbidden of ['SceneRenderer', 'new THREE', 'BufferGeometry', 'CylinderGeometry', 'BoxGeometry', 'fabricatedLength', 'portOffset', 'gasketThickness', 'boltCount', 'createObjectURL']) {
    assert.equal(source.includes(forbidden), false, `BM1 dashboard controls must not introduce ${forbidden}`);
  }
});
