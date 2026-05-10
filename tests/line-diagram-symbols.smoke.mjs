import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLineDiagramMesh } from '../domains/piping/line-diagram-symbols.js';

function comp(type, geometry = {}) {
  return {
    id: `slice3-${type}`,
    type,
    geometry: {
      ep1: { x: 0, y: 0, z: 0 },
      ep2: { x: 1000, y: 0, z: 0 },
      origin: { x: 500, y: 0, z: 0 },
      ...geometry,
    },
    attributes: {},
    metadata: {},
  };
}

function stats(root) {
  const out = {
    group: 0,
    mesh: 0,
    line: 0,
    lineSegments: 0,
  };

  root?.traverse?.((node) => {
    if (node.isGroup) out.group += 1;
    if (node.isMesh) out.mesh += 1;
    if (node.isLine && !node.isLineSegments) out.line += 1;
    if (node.isLineSegments) out.lineSegments += 1;
  });

  return out;
}

function assertStickOnly(root, label) {
  assert.ok(root instanceof THREE.Group, `${label}: expected THREE.Group`);

  const s = stats(root);

  assert.equal(s.mesh, 0, `${label}: line diagram must not contain THREE.Mesh solid bodies`);
  assert.ok(
    s.line + s.lineSegments > 0,
    `${label}: line diagram must contain Line or LineSegments`
  );

  assert.equal(root.userData.visualProfile, 'lineDiagram', `${label}: missing visualProfile userdata`);
  assert.equal(root.userData.lineDiagram, true, `${label}: missing lineDiagram userdata`);
}

assertStickOnly(buildLineDiagramMesh(comp('PIPE'), 'DraftLight'), 'PIPE');
assertStickOnly(buildLineDiagramMesh(comp('LINE'), 'DraftLight'), 'LINE');

assertStickOnly(buildLineDiagramMesh(comp('BEND', {
  ep1: { x: 0, y: 0, z: 0 },
  cp:  { x: 500, y: 500, z: 0 },
  ep2: { x: 1000, y: 0, z: 0 },
}), 'DraftLight'), 'BEND');

assertStickOnly(buildLineDiagramMesh(comp('ELBOW', {
  ep1: { x: 0, y: 0, z: 0 },
  cp:  { x: 500, y: 500, z: 0 },
  ep2: { x: 1000, y: 0, z: 0 },
}), 'DraftLight'), 'ELBOW');

assertStickOnly(buildLineDiagramMesh(comp('TEE', {
  bp: { x: 500, y: 500, z: 0 },
}), 'DraftLight'), 'TEE');

assertStickOnly(buildLineDiagramMesh(comp('OLET', {
  bp: { x: 500, y: 500, z: 0 },
}), 'DraftLight'), 'OLET');

const valve = buildLineDiagramMesh(comp('VALVE'), 'DraftLight');
assertStickOnly(valve, 'VALVE');
assert.ok(stats(valve).lineSegments >= 1, 'VALVE should include bowtie segments');

assertStickOnly(buildLineDiagramMesh(comp('FLANGE'), 'DraftLight'), 'FLANGE');
assertStickOnly(buildLineDiagramMesh(comp('REDUCER'), 'DraftLight'), 'REDUCER');
assertStickOnly(buildLineDiagramMesh(comp('SUPPORT'), 'DraftLight'), 'SUPPORT');

assert.equal(buildLineDiagramMesh(comp('ANNOTATION'), 'DraftLight'), null);
assert.equal(buildLineDiagramMesh(comp('BLOCK_COMPONENT'), 'DraftLight'), null);
assert.equal(buildLineDiagramMesh(comp('PROXY_DXF_ENTITY'), 'DraftLight'), null);

for (const theme of [
  'NavisDark',
  'DraftLight',
  'DraftDark',
  'Blueprint',
  'MonochromeTechnical',
  'HighContrastReview',
]) {
  assertStickOnly(buildLineDiagramMesh(comp('PIPE'), theme), `PIPE ${theme}`);
  assertStickOnly(buildLineDiagramMesh(comp('VALVE'), theme), `VALVE ${theme}`);
}

console.log('PASS line-diagram-symbols.smoke.mjs');
