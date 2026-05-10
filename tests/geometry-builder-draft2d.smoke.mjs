import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMesh } from '../domains/piping/geometry-builder.js';

function comp(type, geometry = {}) {
  return {
    id: `slice4-builder-${type}`,
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

function assertBuilderDraft2d(root, label) {
  assert.ok(root instanceof THREE.Group, `${label}: expected Group from Draft2D builder`);

  const s = stats(root);

  assert.equal(s.mesh, 0, `${label}: canonical draft2d must not contain Mesh`);
  assert.ok(s.line + s.lineSegments > 0, `${label}: expected line primitives`);
  assert.equal(root.userData.visualProfile, 'draft2d', `${label}: visualProfile not propagated`);
  assert.equal(root.userData.draft2d, true, `${label}: draft2d flag not propagated`);
}

function assertBuilderLineDiagram(root, label) {
  assert.ok(root instanceof THREE.Group, `${label}: expected Group from line diagram builder`);

  const s = stats(root);

  assert.equal(s.mesh, 0, `${label}: canonical lineDiagram must not contain Mesh`);
  assert.ok(s.line + s.lineSegments > 0, `${label}: expected line primitives`);
  assert.equal(root.userData.visualProfile, 'lineDiagram', `${label}: lineDiagram visualProfile not propagated`);
}

const draftPipe = buildMesh(comp('PIPE'), 'DraftLight', { visualProfile: 'draft2d' });
assertBuilderDraft2d(draftPipe, 'PIPE canonical draft2d');
assert.ok(stats(draftPipe).line >= 3, 'PIPE draft2d should include two edge lines plus centerline');
assert.ok(stats(draftPipe).dashed >= 1, 'PIPE draft2d should include dashed centerline');

assertBuilderDraft2d(
  buildMesh(comp('VALVE'), 'DraftLight', { visualProfile: 'draft2d' }),
  'VALVE canonical draft2d'
);

assertBuilderDraft2d(
  buildMesh(comp('TEE', { bp: { x: 500, y: 500, z: 0 } }), 'DraftLight', { visualProfile: 'draft2d' }),
  'TEE canonical draft2d'
);

assertBuilderDraft2d(
  buildMesh(comp('REDUCER'), 'DraftLight', { visualProfile: 'draft2d' }),
  'REDUCER canonical draft2d'
);

assertBuilderDraft2d(
  buildMesh(comp('SUPPORT'), 'DraftLight', { visualProfile: 'draft2d' }),
  'SUPPORT canonical draft2d'
);

assertBuilderLineDiagram(
  buildMesh(comp('PIPE'), 'DraftLight', { visualProfile: 'lineDiagram' }),
  'PIPE canonical lineDiagram still works'
);

const annotation = buildMesh(comp('ANNOTATION'), 'DraftLight', { visualProfile: 'draft2d' });
assert.equal(annotation, null, 'ANNOTATION must remain label-only in Draft2D');

console.log('PASS geometry-builder-draft2d.smoke.mjs');
