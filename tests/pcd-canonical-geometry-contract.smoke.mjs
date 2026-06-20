import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanonicalEditGraph } from '../core/ceg/canonical-edit-graph.js';
import { createAnchor } from '../core/ceg/canonical-anchor.js';
import { createComponent } from '../core/ceg/canonical-component.js';
import { enrichCegWithPipeData } from '../domains/piping/pipe-data-enrichment.js';
import {
  fromCeg,
  toCanonicalGeometry,
} from '../vendor/pipe-component-data/src/index.js';

function buildPipeCeg() {
  const graph = createCanonicalEditGraph({ name: 'canonical-geometry-contract' });
  graph.anchors['P1:EP1'] = createAnchor({ id: 'P1:EP1', role: 'EP1', point: { x: 0, y: 0, z: 0 } });
  graph.anchors['P1:EP2'] = createAnchor({ id: 'P1:EP2', role: 'EP2', point: { x: 1000, y: 0, z: 0 } });
  graph.components.P1 = createComponent({
    id: 'P1',
    type: 'PIPE',
    anchorIds: ['P1:EP1', 'P1:EP2'],
    geometryRole: 'LINEAR',
    attributes: { COMPONENT: 'PIPE', NPS: '4', SCHEDULE: '40', BORE: 102.26 },
  });
  return graph;
}

function finiteNumericLeaves(value, path = '$', out = []) {
  if (typeof value === 'number') out.push({ path, value });
  else if (Array.isArray(value)) value.forEach((item, index) => finiteNumericLeaves(item, `${path}[${index}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) finiteNumericLeaves(item, `${path}.${key}`, out);
  }
  return out;
}

test('public canonical geometry contract preserves exact pipe dimensions and length', () => {
  const { ceg, enriched, missed } = enrichCegWithPipeData(buildPipeCeg());
  assert.equal(enriched, 1);
  assert.equal(missed, 0);

  const adapterGraph = fromCeg(ceg, { profile: 'CANONICAL-GEOMETRY-CONTRACT-SMOKE' });
  const payload = toCanonicalGeometry(adapterGraph, { fluidDensityKgM3: 1000 });

  assert.equal(payload.schema, 'simplified-canonical-geometry/v1');
  assert.equal(payload.sourceGraphProfile, 'CANONICAL-GEOMETRY-CONTRACT-SMOKE');
  assert.deepEqual(payload.units, { length: 'MM', mass: 'KG', force: 'N' });
  assert.equal(payload.segments.length, 1);

  const [segment] = payload.segments;
  assert.equal(segment.componentId, 'P1');
  assert.equal(segment.componentType, 'PIPE');
  assert.equal(segment.length_mm, 1000);
  assert.equal(segment.pipe.outerDiameter_mm, 114.3);
  assert.equal(segment.pipe.wallThickness_mm, 6.02);
  assert.equal(segment.pipe.internalDiameter_mm, 102.26);
  assert.equal(segment.pipe.materialDensity_kg_per_m3, 7850);
});

test('public canonical geometry contract produces finite mass and force totals', () => {
  const { ceg } = enrichCegWithPipeData(buildPipeCeg());
  const adapterGraph = fromCeg(ceg, { profile: 'CANONICAL-GEOMETRY-CONTRACT-SMOKE' });
  const payload = toCanonicalGeometry(adapterGraph, { fluidDensityKgM3: 1000 });

  const [segment] = payload.segments;
  assert.ok(segment.metalMass_kg > 16 && segment.metalMass_kg < 17, 'pipe metal mass uses PipeData kg/m for 1 m');
  assert.ok(segment.contentsMass_kg > 8 && segment.contentsMass_kg < 9, 'contents mass uses exact bore');
  assert.ok(segment.totalMass_kg > 24 && segment.totalMass_kg < 26, 'total mass combines metal and contents');
  assert.ok(payload.totals.weight_N > 235 && payload.totals.weight_N < 255, 'total weight is finite and plausible');
  assert.equal(payload.totals.supportReaction_N, 0);

  for (const leaf of finiteNumericLeaves(payload)) {
    assert.ok(Number.isFinite(leaf.value), `finite numeric leaf: ${leaf.path}`);
  }
});
