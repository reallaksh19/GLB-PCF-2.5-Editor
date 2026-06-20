import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPONENT_STUDIO_SCHEMA,
  createComponentStudioModel,
  makeNormalizedRow,
  numericSource,
  sourceValue,
} from '../vendor/pipe-component-data/src/index.js';

function buildValveRow() {
  const normalized = makeNormalizedRow({
    id: 'VALVE|GATE|NPS8|CL150|RF',
    componentType: 'VALVE',
    subtype: 'GATE',
    keys: {
      nps: sourceValue('8'),
      classRating: sourceValue('150'),
      facing: sourceValue('RF'),
    },
    dimensions: {
      faceToFaceRfMm: numericSource(292, 'mm', { sourceColumn: 'RF' }),
      heightMm: numericSource(960, 'mm', { sourceColumn: 'H' }),
      handwheelDiaMm: numericSource(350, 'mm', { sourceColumn: 'HANDWHEEL' }),
    },
    weights: {
      weightKg: numericSource(144, 'kg', { sourceColumn: 'WEIGHT' }),
    },
    provenance: {
      standard: 'ASME B16.10',
      source: 'PipeData Vlfl/VLV1150.csv',
      datasetVersion: 'pipedata-db/2026.06.phase5-smoke',
      dataStatus: 'VERIFIED_SCREENING',
    },
    sourceRefs: [{ source: 'PipeData Vlfl/VLV1150.csv', rowNumber: 1 }],
  });
  return {
    ...normalized,
    source: normalized.provenance.source,
    datasetVersion: normalized.provenance.datasetVersion,
    dataStatus: normalized.provenance.dataStatus,
    sourceRowNumber: normalized.sourceRefs[0].rowNumber,
  };
}

function buildStudioAssets(row = buildValveRow()) {
  return {
    query: 'VALVE|GATE|NPS8|CL150|RF',
    searchIndex: {
      noFallbackPolicy: 'Exact component studio selection only. No nearest-size or family fallback.',
      entries: [{
        id: row.id,
        family: 'VALVE',
        source: 'VALVE',
        dataStatus: row.dataStatus,
        description: 'Gate valve NPS 8 class 150 RF',
        aliases: [row.id, 'gate valve 8 class 150 rf'],
        filters: { componentType: 'VALVE', valveType: 'GATE', nps: '8', classRating: '150', facing: 'RF' },
      }],
    },
    catalogs: { VALVE: [row] },
  };
}

test('public Component Studio model exposes the stable schema and exact selector state', () => {
  const model = createComponentStudioModel(buildStudioAssets());

  assert.equal(model.schema, COMPONENT_STUDIO_SCHEMA);
  assert.equal(model.selector.mode, 'EXACT_ALIAS_ONLY');
  assert.equal(model.selector.selectedId, 'VALVE|GATE|NPS8|CL150|RF');
  assert.equal(model.selector.selectedFamily, 'VALVE');
  assert.equal(model.selector.selectedStatus, 'VERIFIED_SCREENING');
  assert.equal(model.search.ok, true);
  assert.equal(model.search.resultCount, 1);
  assert.equal(model.selector.noFallbackPolicy, 'Exact component studio selection only. No nearest-size or family fallback.');
});

test('public Component Studio model renders tagged dimensions and provenance audit', () => {
  const model = createComponentStudioModel(buildStudioAssets());

  assert.equal(model.dataPanel.normalizedRowAvailable, true);
  assert.equal(model.dataPanel.normalizedRowId, 'VALVE|GATE|NPS8|CL150|RF');
  assert.equal(model.dataPanel.identity.find(([key]) => key === 'Status')?.[1], 'VERIFIED_SCREENING');

  const faceToFace = model.dataPanel.attributes.find((item) => item.key === 'faceToFaceRfMm');
  assert.equal(faceToFace.label, 'RF Face-to-face');
  assert.equal(faceToFace.value, 292);
  assert.equal(faceToFace.unit, 'mm');
  assert.equal(faceToFace.basis, 'SOURCE_VALUE');

  assert.equal(model.sourceAudit.visibleInNormalWorkflow, false);
  assert.equal(model.sourceAudit.source, 'PipeData Vlfl/VLV1150.csv');
  assert.equal(model.sourceAudit.datasetVersion, 'pipedata-db/2026.06.phase5-smoke');
  assert.equal(model.sourceAudit.taggedValueCount, 4);
});

test('public Component Studio model makes verification chips explicit', () => {
  const model = createComponentStudioModel(buildStudioAssets());
  const chips = Object.fromEntries(model.verification.map((chip) => [chip.label, chip.status]));

  assert.equal(chips['Exact match'], 'ok');
  assert.equal(chips['No fallback used'], 'ok');
  assert.equal(chips['No fabricated dimensions'], 'ok');
  assert.equal(chips['Provenance complete'], 'ok');
  assert.equal(chips['Status VERIFIED_SCREENING'], 'ok');
});

test('public Component Studio model reports no exact selection without fallback', () => {
  const model = createComponentStudioModel({
    ...buildStudioAssets(),
    query: 'missing valve 10 class 900 rf',
  });

  assert.equal(model.search.ok, false);
  assert.equal(model.search.resultCount, 0);
  assert.equal(model.selector.selectedId, null);
  assert.equal(model.dataPanel.normalizedRowAvailable, false);
  assert.equal(model.dataPanel.title, 'No exact component selected');
  assert.equal(model.verification.find((chip) => chip.label === 'Exact match')?.status, 'warn');
});
