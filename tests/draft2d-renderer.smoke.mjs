import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildDraft2dMesh } from '../domains/piping/draft2d-renderer.js';

function comp(type, geometry = {}) {
  return {
    id: `slice4-${type}`,
    type,
    geometry: {
      ep1: { x: 0, y: 0, z: 0 },
      ep2: { x: 1000, y: 0, z: 0 },
      origin: { x: 500, y: 0, z: 0 },
      bore: 100,
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
    dashed: 0,
  };

  root?.traverse?.((node) => {
    if (node.isGroup) out.group += 1;
    if (node.isMesh) out.mesh += 1;
    if (node.isLine && !node.isLineSegments) out.line += 1;
    if (node.isLineSegments) out.lineSegments += 1;
    if (node.material?.isLineDashedMaterial) out.dashed += 1;
  });

  return out;
}

function assertDraft2d(root, label) {
  assert.ok(root instanceof THREE.Group, `${label}: expected THREE.Group`);

  const s = stats(root);

  assert.equal(s.mesh, 0, `${label}: Draft2D must not use solid Mesh body geometry`);
  assert.ok(s.line + s.lineSegments > 0, `${label}: expected line primitives`);
  assert.equal(root.userData.visualProfile, 'draft2d', `${label}: missing draft2d visualProfile userdata`);
  assert.equal(root.userData.draft2d, true, `${label}: missing draft2d userdata`);
}

const pipe = buildDraft2dMesh(comp('PIPE'), 'DraftLight');
assertDraft2d(pipe, 'PIPE');
assert.ok(stats(pipe).line >= 3, 'PIPE should have two pipe edge lines plus centerline');
assert.ok(stats(pipe).dashed >= 1, 'PIPE should have dashed centerline');

const line = buildDraft2dMesh(comp('LINE'), 'DraftLight');
assertDraft2d(line, 'LINE');
assert.ok(stats(line).line >= 3, 'LINE should render as double-line drafting geometry');

const bend = buildDraft2dMesh(comp('BEND', {
  ep1: { x: 0, y: 0, z: 0 },
  cp:  { x: 500, y: 500, z: 0 },
  ep2: { x: 1000, y: 0, z: 0 },
}), 'DraftLight');
assertDraft2d(bend, 'BEND');
assert.ok(stats(bend).dashed >= 1, 'BEND should have dashed centerline');

const tee = buildDraft2dMesh(comp('TEE', {
  bp: { x: 500, y: 500, z: 0 },
}), 'DraftLight');
assertDraft2d(tee, 'TEE');
assert.ok(stats(tee).line >= 4, 'TEE should include run and branch drafting lines');

const olet = buildDraft2dMesh(comp('OLET', {
  bp: { x: 500, y: 500, z: 0 },
}), 'DraftLight');
assertDraft2d(olet, 'OLET');

const valve = buildDraft2dMesh(comp('VALVE'), 'DraftLight');
assertDraft2d(valve, 'VALVE');
assert.ok(stats(valve).lineSegments >= 1, 'VALVE should include bowtie/stem line segments');

const flange = buildDraft2dMesh(comp('FLANGE'), 'DraftLight');
assertDraft2d(flange, 'FLANGE');
assert.ok(stats(flange).lineSegments >= 1, 'FLANGE should include tick marks');

const reducer = buildDraft2dMesh(comp('REDUCER'), 'DraftLight');
assertDraft2d(reducer, 'REDUCER');
assert.ok(stats(reducer).lineSegments >= 1, 'REDUCER should include taper line segments');

const support = buildDraft2dMesh(comp('SUPPORT'), 'DraftLight');
assertDraft2d(support, 'SUPPORT');
assert.ok(stats(support).lineSegments >= 1, 'SUPPORT should include support marker');

const guide = buildDraft2dMesh({
  id: 'slice4-guide',
  type: 'GUIDE',
  geometry: {
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 500, y: 300, z: 0 },
      { x: 1000, y: 0, z: 0 },
    ],
  },
  attributes: { guideType: 'SPLINE' },
  metadata: {},
}, 'DraftLight');
assertDraft2d(guide, 'GUIDE');
assert.ok(stats(guide).dashed >= 1, 'GUIDE should render as dashed line');

assert.equal(buildDraft2dMesh(comp('ANNOTATION'), 'DraftLight'), null);
assert.equal(buildDraft2dMesh(comp('BLOCK_COMPONENT'), 'DraftLight'), null);
assert.equal(buildDraft2dMesh(comp('PROXY_DXF_ENTITY'), 'DraftLight'), null);

for (const theme of [
  'NavisDark',
  'DraftLight',
  'DraftDark',
  'Blueprint',
  'MonochromeTechnical',
  'HighContrastReview',
]) {
  assertDraft2d(buildDraft2dMesh(comp('PIPE'), theme), `PIPE ${theme}`);
  assertDraft2d(buildDraft2dMesh(comp('VALVE'), theme), `VALVE ${theme}`);
}

console.log('PASS draft2d-renderer.smoke.mjs');
