import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalEditGraph } from '../core/ceg/canonical-edit-graph.js';
import { createAnchor } from '../core/ceg/canonical-anchor.js';
import { createComponent } from '../core/ceg/canonical-component.js';
import { graphToGenericComponents } from '../core/geometry/geometry-view.js';
import { enrichCegWithPipeData } from '../domains/piping/pipe-data-enrichment.js';

function buildFlangeCeg() {
  const graph = createCanonicalEditGraph({ name: 'pcd-solid3d-dims' });
  graph.anchors['F1:EP1'] = createAnchor({ id: 'F1:EP1', role: 'EP1', point: { x: 0, y: 0, z: 0 } });
  graph.anchors['F1:EP2'] = createAnchor({ id: 'F1:EP2', role: 'EP2', point: { x: 90, y: 0, z: 0 } });
  graph.components.F1 = createComponent({
    id: 'F1',
    type: 'FLANGE',
    anchorIds: ['F1:EP1', 'F1:EP2'],
    geometryRole: 'LINEAR',
    attributes: { COMPONENT: 'FLANGE', SUBTYPE: 'WN', NPS: '4', CLASS: '300', FACING: 'RF', BORE: 100 },
  });
  return graph;
}

test('enriched flange carries real PipeData dims into generic geometry', () => {
  const { ceg } = enrichCegWithPipeData(buildFlangeCeg());
  const [generic] = graphToGenericComponents(ceg);
  assert.equal(generic.geometry.flangeOdMm, 255, 'real flange OD carried (4" CL300 WN)');
  assert.equal(generic.geometry.flangeThicknessMm, 30.2, 'real flange thickness carried');
  assert.equal(generic.geometry.bore, 100, 'bore fallback field untouched');
});

test('unenriched component exposes no PipeData dimension fields', () => {
  const [generic] = graphToGenericComponents(buildFlangeCeg());
  assert.equal(generic.geometry.flangeOdMm, undefined);
  assert.equal(generic.geometry.faceToFaceMm, undefined);
  assert.equal(generic.geometry.bore, 100, 'bore-multiplier fallback path intact');
});
