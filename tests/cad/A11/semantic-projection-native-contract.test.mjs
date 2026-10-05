import test from 'node:test';
import assert from 'node:assert/strict';

import { DxfDocument } from '../../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../../formats/dxf/model/dxf-entity.js';
import {
  RecognitionPolicy,
  derivePipingCegFromDxfDocument,
} from '../../../formats/dxf/semantic/index.js';
import {
  SourceRef,
  SemanticComponentRef,
  SemanticLinkManager,
} from '../../../formats/cad/semantic-links/index.js';

function doc(entities = [], revision = 0, units = {}) {
  const d = new DxfDocument({ id: 'native-D', units });
  d.revision = revision;
  for (const entity of entities) d.addEntity(entity);
  return d;
}

function line(id = 'native-L', layerId = 'PIPING', end = 2) {
  return new DxfEntity({
    id,
    type: 'LINE',
    layerId,
    geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: end, y: 0, z: 0 } },
    source: { rawTags: [{ code: 1000, value: 'preserve-me' }] },
  });
}

function exactPolicy() {
  return {
    version: 'native-contract-1',
    connectionTolerance: 0.01,
    classifyEntity: entity => ({
      recognized: entity.type === 'LINE',
      componentType: 'PIPE',
      confidence: 1,
      ruleId: 'EXPLICIT_TEST_LINE',
      reasons: ['controlled positive LINE fixture'],
    }),
  };
}

test('A11 native INSERT uses insertionPoint and geometry.rotation', () => {
  const entities = [10, 20].map((x, index) => new DxfEntity({
    id: `instance-${index}`,
    type: 'INSERT',
    attributes: { blockName: 'VALVE' },
    geometry: {
      insertionPoint: { x, y: 3, z: 0 },
      rotation: index * 45,
      scale: { x: 1, y: 1, z: 1 },
    },
  }));
  const result = derivePipingCegFromDxfDocument(doc(entities));
  assert.deepEqual(result.components.map(c => c.primaryEntityId), entities.map(e => e.id));
  assert.deepEqual(result.components.map(c => c.properties.position.x), [10, 20]);
  assert.deepEqual(result.components.map(c => c.properties.rotation), [0, 45]);
});

test('A11 component replacement purges stale reverse links', () => {
  const manager = new SemanticLinkManager({ documentId: 'native-D' });
  const ref = id => new SourceRef({ cadEntityId: id, documentId: 'native-D' });
  const comp = (id, ids) => new SemanticComponentRef({
    componentId: id,
    componentType: 'PIPE',
    sourceRefs: ids.map(ref),
  });

  manager.registerComponent(comp('A', ['L1', 'L2']));
  manager.registerComponent(comp('B', ['L1']));
  manager.registerComponent(comp('A', ['L3']));

  assert.deepEqual(manager.getComponentsForEntity('L2'), []);
  assert.deepEqual(manager.getComponentsForEntity('L1').map(c => c.componentId), ['B']);
  assert.deepEqual(manager.getComponent('A').sourceRefs.map(r => r.cadEntityId), ['L3']);
});

test('A11 IN source coordinates derive engineering millimetres without source mutation', () => {
  const d = doc([line()], 0, { sourceUnit: 'IN', insunits: 1 });
  const before = structuredClone(d);
  const result = derivePipingCegFromDxfDocument(d, { policy: exactPolicy() });

  assert.equal(result.components[0].properties.end.x, 50.8);
  assert.equal(result.components[0].properties.length, 50.8);
  assert.equal(result.statistics.unitConversion.engineeringUnit, 'mm');
  assert.equal(result.statistics.unitConversion.mmPerSourceUnit, 25.4);
  assert.equal(result.statistics.unitConversion.isExplicit, true);
  assert.deepEqual(structuredClone(d), before);
});

test('A11 native layerId reaches explicit recognition policy', () => {
  const d = doc([line()]);
  const policy = new RecognitionPolicy({
    version: 'explicit-fixture-1',
    pipingLayerPatterns: [/^PIPING$/],
    nonPipingLayerPatterns: [],
    connectionTolerance: 0.01,
  });
  const a = derivePipingCegFromDxfDocument(d, { policy });
  const b = derivePipingCegFromDxfDocument(d, { policy });
  assert.equal(a.components.length, 1);
  assert.equal(a.policyVersion, 'explicit-fixture-1');
  assert.equal(a.components[0].confidence, 0.95);
  assert.deepEqual(a.toJSON(), b.toJSON());
});

test('A11 projection binds authoritative DxfDocument.revision and rejects stale results', () => {
  const d = doc([line()], 7);
  const result = derivePipingCegFromDxfDocument(d, { policy: exactPolicy() });
  assert.equal(result.sourceRevision, 7);
  d.revision = 8;
  assert.throws(
    () => result.validateFreshness(d),
    error => error.code === 'STALE_REVISION' && error.projectedRevision === 7 && error.currentRevision === 8,
  );
});

test('A11 SourceRef does not alias nested occurrence context', () => {
  const source = { nested: { x: 1 } };
  const path = [{ instanceId: 'I', transform: source }];
  const ref = new SourceRef({ cadEntityId: 'L', occurrencePath: path });

  ref.occurrencePath[0].transform.nested.x = 999;
  assert.equal(source.nested.x, 1);

  const json = ref.toJSON();
  json.occurrencePath[0].transform.nested.x = 123;
  assert.equal(ref.occurrencePath[0].transform.nested.x, 999);
});
