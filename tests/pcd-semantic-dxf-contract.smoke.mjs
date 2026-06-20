import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanonicalEditGraph } from '../core/ceg/canonical-edit-graph.js';
import { createAnchor } from '../core/ceg/canonical-anchor.js';
import { createComponent } from '../core/ceg/canonical-component.js';
import { enrichCegWithPipeData } from '../domains/piping/pipe-data-enrichment.js';
import {
  fromCeg,
  fromSemanticDxf,
  toSemanticDxf,
} from '../vendor/pipe-component-data/src/index.js';

function buildRoundTripCeg() {
  const graph = createCanonicalEditGraph({ name: 'semantic-dxf-contract' });
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

test('public Semantic DXF contract emits DXF plus semantic sidecar', () => {
  const { ceg } = enrichCegWithPipeData(buildRoundTripCeg());
  const adapterGraph = fromCeg(ceg, { profile: 'SEMANTIC-DXF-CONTRACT-SMOKE' });
  const payload = toSemanticDxf(adapterGraph, { source: 'GLB-PCF-Phase3' });

  assert.match(payload.dxf, /SECTION/);
  assert.match(payload.dxf, /ENTITIES/);
  assert.equal(payload.sidecar.schema, 'semantic-dxf-sidecar/v1');
  assert.equal(payload.sidecar.source, 'GLB-PCF-Phase3');
  assert.equal(payload.sidecar.componentCount, 1);
  assert.equal(payload.sidecar.graph.components[0].id, 'F1');
  assert.equal(payload.sidecar.graph.components[0].derived.dimensions.flangeOdMm, 255);
});

test('public Semantic DXF sidecar round-trips the enriched adapter graph', () => {
  const { ceg } = enrichCegWithPipeData(buildRoundTripCeg());
  const adapterGraph = fromCeg(ceg, { profile: 'SEMANTIC-DXF-CONTRACT-SMOKE' });
  const payload = toSemanticDxf(adapterGraph, { source: 'GLB-PCF-Phase3' });
  const restored = fromSemanticDxf(payload, { source: 'roundtrip-test' });

  assert.equal(restored.components.length, adapterGraph.components.length);
  assert.equal(restored.anchors.length, adapterGraph.anchors.length);
  assert.equal(restored.components[0].id, 'F1');
  assert.equal(restored.components[0].derived.dimensions.flangeThicknessMm, 30.2);
  assert.deepEqual(restored.lossContract, adapterGraph.lossContract);
});

test('DXF-only import degrades explicitly when sidecar is absent', () => {
  const restored = fromSemanticDxf('0\nSECTION\n2\nENTITIES\n0\nLINE\n0\nENDSEC\n0\nEOF\n', { source: 'dxf-only' });
  assert.equal(restored.components.length, 1);
  assert.equal(restored.components[0].confidence, 'DOWNGRADED_DXF_ONLY');
  assert.equal(restored.diagnostics[0].code, 'DXF_ONLY_IMPORT_DOWNGRADED');
});
