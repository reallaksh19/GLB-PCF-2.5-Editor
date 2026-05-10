import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMesh } from '../domains/piping/geometry-builder.js';

function comp(type, geometry = {}) {
  return {
    id: `slice3-builder-${type}`,
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

function assertBuilderLineDiagram(root, label) {
  assert.ok(root instanceof THREE.Group, `${label}: expected Group from line diagram builder`);

  const s = stats(root);

  assert.equal(s.mesh, 0, `${label}: canonical lineDiagram must not contain Mesh`);
  assert.ok(s.line + s.lineSegments > 0, `${label}: expected line primitives`);
  assert.equal(root.userData.visualProfile, 'lineDiagram', `${label}: visualProfile not propagated`);
}

assertBuilderLineDiagram(
  buildMesh(comp('PIPE'), 'DraftLight', { visualProfile: 'lineDiagram' }),
  'PIPE canonical lineDiagram'
);

assertBuilderLineDiagram(
  buildMesh(comp('PIPE'), 'DraftLight', { visualProfile: 'stick' }),
  'PIPE legacy stick'
);

assertBuilderLineDiagram(
  buildMesh(comp('PIPE'), 'DraftLight', { lineDiagram: true }),
  'PIPE lineDiagram boolean'
);

assertBuilderLineDiagram(
  buildMesh(comp('VALVE'), 'DraftLight', { visualProfile: 'lineDiagram' }),
  'VALVE canonical lineDiagram'
);

assertBuilderLineDiagram(
  buildMesh(comp('TEE', { bp: { x: 500, y: 500, z: 0 } }), 'DraftLight', { visualProfile: 'lineDiagram' }),
  'TEE canonical lineDiagram'
);

const annotation = buildMesh(comp('ANNOTATION'), 'DraftLight', { visualProfile: 'lineDiagram' });
assert.equal(annotation, null, 'ANNOTATION must remain label-only in line diagram');

console.log('PASS geometry-builder-line-diagram.smoke.mjs');
