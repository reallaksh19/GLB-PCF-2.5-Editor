import test from 'node:test';
import assert from 'node:assert/strict';

import { DxfDocument } from '../../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../../formats/dxf/model/dxf-layer.js';
import {
  SourceRef,
  SemanticComponentRef,
  SemanticLinkManager,
  SemanticSelectionResolver,
  SemanticSelectionResult,
  SemanticSelectionError,
} from '../../../formats/cad/semantic-links/index.js';
import {
  derivePipingCegFromDxfDocument,
  SemanticCommandDispatcher,
  SemanticCommandDispatchError,
  SemanticDispatchResult,
} from '../../../formats/dxf/semantic/index.js';
import { CommandHistory } from '../../../core/commands/cad/command-history.js';

function createTestDoc({ id = 'test-doc', revision = 0 } = {}) {
  const doc = new DxfDocument({ id });
  doc.revision = revision;
  doc.sourceRevision = revision;

  const pipingLayer = new DxfLayer({ name: 'PIPING', colorIndex: 1 });
  const lockedLayer = new DxfLayer({ name: 'LOCKED_LAYER', locked: true });
  doc.addLayer(pipingLayer);
  doc.addLayer(lockedLayer);

  return doc;
}

function createTestEntities() {
  const line = new DxfEntity({
    id: 'entity:line:100',
    handle: '100',
    type: 'LINE',
    layerId: 'PIPING',
    geometry: {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
    },
  });

  const valve = new DxfEntity({
    id: 'entity:insert:200',
    handle: '200',
    type: 'INSERT',
    layerId: 'PIPING',
    attributes: { blockName: 'GATE_VALVE' },
    geometry: {
      insertionPoint: { x: 100, y: 0, z: 0 },
      point: { x: 100, y: 0, z: 0 },
      rotation: 0,
      scale: { x: 1, y: 1, z: 1 },
    },
  });

  return { line, valve };
}

test('A11-SEL-01: SemanticSelectionResolver resolves component ID to exact native entity IDs', () => {
  const doc = createTestDoc();
  const { line, valve } = createTestEntities();
  doc.addEntity(line);
  doc.addEntity(valve);

  const projection = derivePipingCegFromDxfDocument(doc);
  assert.equal(projection.components.length, 2);

  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  const pipeComp = projection.components.find(c => c.componentType === 'PIPE');
  const res = resolver.resolve(pipeComp.componentId, doc);

  assert.equal(res instanceof SemanticSelectionResult, true);
  assert.equal(res.count, 1);
  assert.deepEqual(res.nativeEntityIds, [line.id]);
  assert.equal(res.components[0].componentId, pipeComp.componentId);
});

test('A11-SEL-02: Stale revision rejection produces STALE_REVISION error before mutation', () => {
  const doc = createTestDoc({ revision: 0 });
  const { line } = createTestEntities();
  doc.addEntity(line);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  // Advance document revision
  doc.revision = 1;
  doc.sourceRevision = 1;

  assert.throws(
    () => resolver.resolve(projection.components[0].componentId, doc),
    (err) => {
      assert.equal(err instanceof SemanticSelectionError, true);
      assert.equal(err.code, 'STALE_REVISION');
      return true;
    }
  );
});

test('A11-SEL-03: Unrecognized component ID rejects with UNRECOGNIZED_COMPONENT', () => {
  const doc = createTestDoc();
  const { line } = createTestEntities();
  doc.addEntity(line);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  assert.throws(
    () => resolver.resolve('NON_EXISTENT_COMPONENT', doc),
    (err) => {
      assert.equal(err instanceof SemanticSelectionError, true);
      assert.equal(err.code, 'UNRECOGNIZED_COMPONENT');
      return true;
    }
  );
});

test('A11-SEL-04: Missing source entity in document rejects with MISSING_SOURCE_ENTITY', () => {
  const doc = createTestDoc();
  const { line } = createTestEntities();
  doc.addEntity(line);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  // Remove native entity from document
  doc.removeEntity(line.id);

  assert.throws(
    () => resolver.resolve(projection.components[0].componentId, doc),
    (err) => {
      assert.equal(err instanceof SemanticSelectionError, true);
      assert.equal(err.code, 'MISSING_SOURCE_ENTITY');
      return true;
    }
  );
});

test('A11-SEL-05: Read-only entity and locked layer targets reject with READ_ONLY_TARGET', () => {
  const doc = createTestDoc();
  const { line, valve } = createTestEntities();
  doc.addEntity(line);
  doc.addEntity(valve);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  // Test locked layer rejection
  line.layerId = 'LOCKED_LAYER';
  assert.throws(
    () => resolver.resolve(projection.components.find(c => c.componentType === 'PIPE').componentId, doc),
    (err) => {
      assert.equal(err instanceof SemanticSelectionError, true);
      assert.equal(err.code, 'READ_ONLY_TARGET');
      return true;
    }
  );

  // Test entity.readOnly rejection
  line.layerId = 'PIPING';
  line.readOnly = true;
  assert.throws(
    () => resolver.resolve(projection.components.find(c => c.componentType === 'PIPE').componentId, doc),
    (err) => {
      assert.equal(err instanceof SemanticSelectionError, true);
      assert.equal(err.code, 'READ_ONLY_TARGET');
      return true;
    }
  );
});

test('A11-SEL-06: Unsupported nested block occurrence target rejects with UNSUPPORTED_OCCURRENCE_TARGET', () => {
  const doc = createTestDoc();
  const linkManager = new SemanticLinkManager({
    documentId: doc.id,
    sourceRevision: doc.revision,
  });

  const nestedComp = new SemanticComponentRef({
    componentId: 'NESTED-VALVE-01',
    componentType: 'VALVE',
    sourceRefs: [
      new SourceRef({
        cadEntityId: 'entity:insert:nested',
        documentId: doc.id,
        sourceRevision: doc.revision,
        occurrencePath: [{ blockName: 'SKID_ASSEMBLY', handle: 'B1' }],
      }),
    ],
  });
  linkManager.registerComponent(nestedComp);

  const resolver = new SemanticSelectionResolver({ linkManager, documentId: doc.id });

  assert.throws(
    () => resolver.resolve('NESTED-VALVE-01', doc),
    (err) => {
      assert.equal(err instanceof SemanticSelectionError, true);
      assert.equal(err.code, 'UNSUPPORTED_OCCURRENCE_TARGET');
      return true;
    }
  );
});

test('A11-DSP-01: SemanticCommandDispatcher executes MOVE without writable CEG divergence', () => {
  const doc = createTestDoc();
  const { line } = createTestEntities();
  doc.addEntity(line);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  const history = new CommandHistory();
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver, commandHistory: history });
  const compId = projection.components[0].componentId;

  const result = dispatcher.dispatch({
    type: 'MOVE',
    target: compId,
    dx: 15,
    dy: 25,
    dz: 0,
  }, doc);

  assert.equal(result instanceof SemanticDispatchResult, true);
  assert.equal(result.operationType, 'MOVE');
  assert.deepEqual(result.affectedEntityIds, [line.id]);
  assert.deepEqual(result.affectedComponentIds, [compId]);

  // Verify authoritative native geometry moved
  assert.equal(line.geometry.start.x, 15);
  assert.equal(line.geometry.start.y, 25);
  assert.equal(line.geometry.end.x, 115);
  assert.equal(line.geometry.end.y, 25);
});

test('A11-DSP-02: SemanticCommandDispatcher integrates with A09 CommandHistory transaction port', () => {
  const doc = createTestDoc();
  const { line } = createTestEntities();
  doc.addEntity(line);

  const history = new CommandHistory();
  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  const dispatcher = new SemanticCommandDispatcher({
    selectionResolver: resolver,
    commandHistory: history,
  });

  const initialRev = doc.revision;
  const compId = projection.components[0].componentId;

  dispatcher.dispatch({
    type: 'MOVE',
    target: compId,
    dx: 50,
    dy: 0,
    dz: 0,
  }, doc);

  // Authoritative revision advanced through history
  assert.equal(doc.revision, initialRev + 1);
  assert.equal(line.geometry.start.x, 50);
  assert.equal(history.canUndo, true);

  // Undo transaction restores native geometry
  history.undo(doc);
  assert.equal(line.geometry.start.x, 0);
  assert.equal(line.geometry.end.x, 100);
});

test('A11-DSP-03: Unsupported semantic command operation rejects with UNSUPPORTED_OPERATION', () => {
  const doc = createTestDoc();
  const { line } = createTestEntities();
  doc.addEntity(line);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver });

  assert.throws(
    () => dispatcher.dispatch({
      type: 'INVENTED_SOLID_CONVERSION',
      target: projection.components[0].componentId,
    }, doc),
    (err) => {
      assert.equal(err instanceof SemanticCommandDispatchError, true);
      assert.equal(err.code, 'UNSUPPORTED_OPERATION');
      return true;
    }
  );
});

test('A11-DSP-04: Batch semantic operations (ROTATE, DELETE, CHANGE_LAYER) operate directly on native entities', () => {
  const doc = createTestDoc();
  const { line, valve } = createTestEntities();
  doc.addEntity(line);
  doc.addEntity(valve);

  const otherLayer = new DxfLayer({ name: 'UTILITIES' });
  doc.addLayer(otherLayer);

  const projection = derivePipingCegFromDxfDocument(doc);
  const resolver = new SemanticSelectionResolver({
    linkManager: projection.linkManager,
    documentId: doc.id,
  });

  const history = new CommandHistory();
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver, commandHistory: history });

  // Test CHANGE_LAYER
  dispatcher.dispatch({
    type: 'CHANGE_LAYER',
    target: projection.components.find(c => c.componentType === 'PIPE').componentId,
    targetLayer: 'UTILITIES',
  }, doc);
  assert.equal(line.layerId, 'UTILITIES');
  projection.linkManager.sourceRevision = doc.revision;

  // Test ROTATE
  dispatcher.dispatch({
    type: 'ROTATE',
    target: projection.components.find(c => c.componentType === 'VALVE').componentId,
    center: { x: 100, y: 0, z: 0 },
    angleDeg: 90,
  }, doc);
  // INSERT rotation updated
  assert.equal(valve.geometry.rotation, 90);
  projection.linkManager.sourceRevision = doc.revision;

  // Test DELETE
  dispatcher.dispatch({
    type: 'DELETE',
    target: projection.components.find(c => c.componentType === 'VALVE').componentId,
  }, doc);
  assert.equal(valve.state.deleted, true);
});
