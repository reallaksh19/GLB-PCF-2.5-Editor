import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanonicalEditGraph } from '../core/ceg/canonical-edit-graph.js';
import { createComponent } from '../core/ceg/canonical-component.js';
import { createAnchor } from '../core/ceg/canonical-anchor.js';
import {
  createPipeDataExactLookupAssets,
  deriveQuery,
  enrichCegWithPipeData,
  PIPE_DATA_DIAGNOSTIC_CODES,
} from '../domains/piping/pipe-data-enrichment.js';

function buildFixtureCeg() {
  const ceg = createCanonicalEditGraph({ name: 'PCD Enrichment Fixture' });

  ceg.anchors['F1:EP1'] = createAnchor({ id: 'F1:EP1', role: 'EP1', point: { x: 0, y: 0, z: 0 } });
  ceg.anchors['F1:EP2'] = createAnchor({ id: 'F1:EP2', role: 'EP2', point: { x: 100, y: 0, z: 0 } });
  ceg.components['F1'] = createComponent({
    id: 'F1',
    type: 'FLANGE',
    anchorIds: ['F1:EP1', 'F1:EP2'],
    geometryRole: 'LINEAR',
    attributes: { COMPONENT: 'FLANGE', SUBTYPE: 'WN', NPS: '4', CLASS: '300', FACING: 'RF' },
  });

  ceg.anchors['V1:EP1'] = createAnchor({ id: 'V1:EP1', role: 'EP1', point: { x: 200, y: 0, z: 0 } });
  ceg.anchors['V1:EP2'] = createAnchor({ id: 'V1:EP2', role: 'EP2', point: { x: 492, y: 0, z: 0 } });
  ceg.components['V1'] = createComponent({
    id: 'V1',
    type: 'VALVE',
    anchorIds: ['V1:EP1', 'V1:EP2'],
    geometryRole: 'LINEAR',
    attributes: { COMPONENT: 'VALVE', SUBTYPE: 'GATE', NPS: '8', CLASS: '150', FACING: 'RF' },
  });

  ceg.anchors['P1:EP1'] = createAnchor({ id: 'P1:EP1', role: 'EP1', point: { x: 600, y: 0, z: 0 } });
  ceg.anchors['P1:EP2'] = createAnchor({ id: 'P1:EP2', role: 'EP2', point: { x: 700, y: 0, z: 0 } });
  ceg.components['P1'] = createComponent({
    id: 'P1',
    type: 'PIPE',
    anchorIds: ['P1:EP1', 'P1:EP2'],
    geometryRole: 'LINEAR',
    attributes: { BORE: '100' },
    derived: { bore: 100 },
  });

  return ceg;
}

function singleComponentCeg(id, type, attributes) {
  const ceg = createCanonicalEditGraph({ name: `${id} Fixture` });
  ceg.components[id] = createComponent({ id, type, attributes });
  return ceg;
}

test('deriveQuery maps CEG attributes to exact PipeComponentData lookup filters', () => {
  const flange = deriveQuery({
    type: 'FLANGE',
    attributes: { SUBTYPE: 'WN', SIZE: '4', RATING: '300#', FACING: 'RAISED' },
  });
  assert.deepEqual(flange, {
    kind: 'flange',
    query: { componentType: 'FLANGE', subtype: 'WN', nps: '4', classRating: '300', facing: 'RF' },
  });

  const valve = deriveQuery({
    type: 'VALVE',
    attributes: { SUBTYPE: 'GATE', NPS: '8', CLASS: '150', FACING: 'RF' },
  });
  assert.deepEqual(valve, {
    kind: 'valve',
    query: { componentType: 'VALVE', valveType: 'GATE', nps: '8', classRating: '150', facing: 'RF' },
  });

  const pipe = deriveQuery({ type: 'PIPE', attributes: { NPS: '4', SCHEDULE: '40' } });
  assert.deepEqual(pipe, { kind: 'pipe', query: { componentType: 'PIPE', nps: '4', schedule: '40' } });

  assert.equal(deriveQuery({ type: 'PIPE', attributes: { BORE: '100' } }), null);
  assert.equal(deriveQuery({ type: 'LINE', attributes: {} }), null);
});

test('enrichCegWithPipeData fills flange and valve dimensions from exact FOUND lookups', () => {
  const input = buildFixtureCeg();
  const { ceg, enriched, missed } = enrichCegWithPipeData(input);

  assert.equal(enriched, 2);
  assert.equal(missed, 0);

  const flange = ceg.components.F1;
  assert.equal(flange.derived.dimensions.flangeOdMm, 255);
  assert.equal(flange.derived.dimensions.flangeThicknessMm, 30.2);
  assert.ok(flange.derived.pipeData.matchKey, 'flange pipeData.matchKey present');
  assert.ok(flange.derived.pipeData.standard, 'flange provenance carried');

  const valve = ceg.components.V1;
  assert.equal(valve.derived.dimensions.faceToFaceMm, 292);
  assert.equal(valve.derived.dimensions.weightKg, 144);
  assert.ok(valve.derived.pipeData.matchKey, 'valve pipeData.matchKey present');
});

test('bore-only component gets insufficient-keys diagnostic and no fabricated dimensions', () => {
  const input = buildFixtureCeg();
  const { ceg } = enrichCegWithPipeData(input);

  const pipe = ceg.components.P1;
  assert.equal(pipe.derived.dimensions, undefined, 'no dimensions fabricated');
  const codes = pipe.diagnostics.map((d) => d.code);
  assert.deepEqual(codes, [PIPE_DATA_DIAGNOSTIC_CODES.insufficientKeys]);
  assert.deepEqual(ceg.anchors['P1:EP1'].point, { x: 600, y: 0, z: 0 });
  assert.deepEqual(ceg.anchors['P1:EP2'].point, { x: 700, y: 0, z: 0 });
  assert.equal(pipe.derived.bore, 100);
});

test('NO_EXACT_MATCH records lookup miss status and never fabricates dimensions', () => {
  const input = singleComponentCeg('F9', 'FLANGE', { SUBTYPE: 'WN', NPS: '6', CLASS: '600', FACING: 'RF' });
  const { ceg, enriched, missed } = enrichCegWithPipeData(input);
  assert.equal(enriched, 0);
  assert.equal(missed, 1);

  const diag = ceg.components.F9.diagnostics.find((d) => d.code === PIPE_DATA_DIAGNOSTIC_CODES.lookupMiss);
  assert.ok(diag, 'miss diagnostic present');
  assert.equal(diag.details.query.nps, '6');
  assert.equal(diag.details.status, 'NO_EXACT_MATCH');
  assert.equal(ceg.components.F9.derived.dimensions, undefined);
});

test('CATALOG_ROW_MISSING is explicit and never falls back', () => {
  const input = singleComponentCeg('F1', 'FLANGE', { SUBTYPE: 'WN', NPS: '4', CLASS: '300', FACING: 'RF' });
  const assets = createPipeDataExactLookupAssets();
  const brokenAssets = { ...assets, catalogs: { ...assets.catalogs, flanges: [] } };
  const { ceg, enriched, missed } = enrichCegWithPipeData(input, brokenAssets);
  assert.equal(enriched, 0);
  assert.equal(missed, 1);

  const diag = ceg.components.F1.diagnostics.find((d) => d.code === PIPE_DATA_DIAGNOSTIC_CODES.catalogRowMissing);
  assert.ok(diag, 'catalog-row-missing diagnostic present');
  assert.equal(diag.details.status, 'CATALOG_ROW_MISSING');
  assert.equal(ceg.components.F1.derived.dimensions, undefined);
});

test('INVALID_ASSETS is explicit and never throws', () => {
  const input = singleComponentCeg('V1', 'VALVE', { SUBTYPE: 'GATE', NPS: '8', CLASS: '150', FACING: 'RF' });
  const { ceg, enriched, missed } = enrichCegWithPipeData(input, { aliases: [], catalogs: {} });
  assert.equal(enriched, 0);
  assert.equal(missed, 1);

  const diag = ceg.components.V1.diagnostics.find((d) => d.code === PIPE_DATA_DIAGNOSTIC_CODES.invalidAssets);
  assert.ok(diag, 'invalid-assets diagnostic present');
  assert.equal(diag.details.status, 'INVALID_ASSETS');
  assert.equal(ceg.components.V1.derived.dimensions, undefined);
});

test('input graph is not mutated', () => {
  const input = buildFixtureCeg();
  const before = JSON.stringify(input);
  enrichCegWithPipeData(input);
  assert.equal(JSON.stringify(input), before);
});
