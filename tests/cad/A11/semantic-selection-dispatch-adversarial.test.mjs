/**
 * tests/cad/A11/semantic-selection-dispatch-adversarial.test.mjs
 *
 * Independent Reviewer adversarial test suite for PR #112 (Milestone A11 / Child #97):
 * Source-linked semantic selection resolution and native command dispatch.
 *
 * Probes:
 * 1. Stale revision detection across revision representations (STALE_REVISION)
 * 2. Document mismatch and missing document validation (DOCUMENT_MISMATCH, MISSING_DOCUMENT)
 * 3. Unrecognized components and ambiguous selections (UNRECOGNIZED_COMPONENT, AMBIGUOUS_SELECTION)
 * 4. Missing and deleted source entities (MISSING_SOURCE_ENTITY)
 * 5. Read-only targets: read-only document, read-only entity, locked layer, frozen layer (READ_ONLY_TARGET)
 * 6. Unsupported occurrence targets with allowOccurrence override (UNSUPPORTED_OCCURRENCE_TARGET)
 * 7. Empty selection and invalid operation dispatch guards (EMPTY_SELECTION, INVALID_OPERATION)
 * 8. Unsupported operation rejection (UNSUPPORTED_OPERATION)
 * 9. Invalid argument validation for CHANGE_LAYER and CHANGE_PROPERTIES (INVALID_ARGUMENT)
 * 10. Operation parameter aliases (MOVE delta, ROTATE rotationDeg/angle, SCALE scaleFactor/scale)
 * 11. Transaction port execution with automatic post-mutation staleness invalidation
 * 12. Immutability invariants and Object.freeze robustness
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SemanticSelectionResolver,
  SemanticSelectionResult,
  SemanticSelectionError,
} from '../../../formats/cad/semantic-links/semantic-selection.js';
import {
  SourceRef,
  SemanticComponentRef,
  SemanticLinkManager,
} from '../../../formats/cad/semantic-links/index.js';
import {
  SemanticCommandDispatcher,
  SemanticDispatchResult,
  SemanticCommandDispatchError,
} from '../../../formats/dxf/semantic/semantic-command-dispatcher.js';
import { CommandHistory } from '../../../core/commands/cad/command-history.js';
import { DxfDocument } from '../../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../../formats/dxf/model/dxf-layer.js';

function createFixtureDoc(docId = 'doc:fixture:01', rev = 1) {
  const doc = new DxfDocument();
  doc.id = docId;
  doc.revision = rev;
  doc.sourceRevision = rev;

  // Add layer PIPES (normal)
  const layerPipes = new DxfLayer({ name: 'PIPES', colorIndex: 1 });
  doc.tables.layers.set('PIPES', layerPipes);

  // Add layer LOCKED_LAYER (locked)
  const layerLocked = new DxfLayer({ name: 'LOCKED_LAYER', locked: true });
  doc.tables.layers.set('LOCKED_LAYER', layerLocked);

  // Add layer FROZEN_LAYER (frozen)
  const layerFrozen = new DxfLayer({ name: 'FROZEN_LAYER', frozen: true });
  doc.tables.layers.set('FROZEN_LAYER', layerFrozen);

  // Entity 1: normal pipe line
  const line1 = new DxfEntity({
    id: `${docId}:line:10`,
    handle: '10',
    type: 'LINE',
    layerId: 'PIPES',
    geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 50, y: 0, z: 0 } },
  });
  doc.addEntity(line1);

  // Entity 2: normal valve insert
  const valve1 = new DxfEntity({
    id: `${docId}:valve:20`,
    handle: '20',
    type: 'INSERT',
    layerId: 'PIPES',
    attributes: { blockName: 'GATE_VALVE' },
    geometry: { point: { x: 50, y: 0, z: 0 } },
  });
  doc.addEntity(valve1);

  return doc;
}

// ---------------------------------------------------------------------------
// ADV-A11-01: Stale revision rejection across revision representations
// ---------------------------------------------------------------------------
test('ADV-A11-01: Stale revision rejection produces STALE_REVISION with structured details', () => {
  const doc = createFixtureDoc('doc:test', 2);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });

  assert.throws(
    () => resolver.resolve('PIPE-001', doc),
    (err) => {
      assert.ok(err instanceof SemanticSelectionError);
      assert.equal(err.code, 'STALE_REVISION');
      assert.equal(err.details.linkRevision, 1);
      assert.equal(err.details.documentRevision, 2);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-02: Document mismatch and missing document validation
// ---------------------------------------------------------------------------
test('ADV-A11-02: Document mismatch and missing document validation', () => {
  const docA = createFixtureDoc('doc:alpha', 1);
  const docB = createFixtureDoc('doc:beta', 1);

  const linkMgr = new SemanticLinkManager({ documentId: 'doc:alpha', sourceRevision: 1 });
  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr, documentId: 'doc:alpha' });

  // Missing document
  assert.throws(
    () => resolver.resolve('PIPE-001', null),
    (err) => err.code === 'MISSING_DOCUMENT'
  );

  // Document ID mismatch
  assert.throws(
    () => resolver.resolve('PIPE-001', docB),
    (err) => err.code === 'DOCUMENT_MISMATCH' && err.expectedDocumentId === 'doc:alpha'
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-03: Unrecognized components and ambiguous selection detection
// ---------------------------------------------------------------------------
test('ADV-A11-03: Unrecognized components and ambiguous selection detection', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });

  // Component 1 and 2 share the same native entity (ambiguous mapping)
  const sharedRef = new SourceRef({ cadEntityId: `${doc.id}:line:10`, sourceRevision: 1 });
  const compA = new SemanticComponentRef({ componentId: 'PIPE-001', componentType: 'PIPE', sourceRefs: [sharedRef] });
  const compB = new SemanticComponentRef({ componentId: 'PIPE-002', componentType: 'PIPE', sourceRefs: [sharedRef] });

  linkMgr.registerComponent(compA);
  linkMgr.registerComponent(compB);

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });

  // 1. Unrecognized component ID
  assert.throws(
    () => resolver.resolve('UNKNOWN_COMP', doc),
    (err) => err.code === 'UNRECOGNIZED_COMPONENT' && err.targetId === 'UNKNOWN_COMP'
  );

  // 2. Ambiguous selection by native entity ID linking to multiple components
  assert.throws(
    () => resolver.resolve(`${doc.id}:line:10`, doc),
    (err) => err.code === 'AMBIGUOUS_SELECTION' && err.candidates.length === 2
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-04: Missing and deleted source entities
// ---------------------------------------------------------------------------
test('ADV-A11-04: Missing and deleted native source entities reject with MISSING_SOURCE_ENTITY', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });

  // Reference to non-existent entity
  const missingRef = new SourceRef({ cadEntityId: 'doc:test:missing:999', sourceRevision: 1 });
  const compMissing = new SemanticComponentRef({ componentId: 'PIPE-GHOST', componentType: 'PIPE', sourceRefs: [missingRef] });
  linkMgr.registerComponent(compMissing);

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });

  assert.throws(
    () => resolver.resolve('PIPE-GHOST', doc),
    (err) => err.code === 'MISSING_SOURCE_ENTITY' && err.cadEntityId === 'doc:test:missing:999'
  );

  // Entity marked deleted
  const deletedEntity = new DxfEntity({ id: 'doc:test:del:50', layerId: 'PIPES' });
  doc.addEntity(deletedEntity);
  deletedEntity.markDeleted();

  const delRef = new SourceRef({ cadEntityId: 'doc:test:del:50', sourceRevision: 1 });
  const compDel = new SemanticComponentRef({ componentId: 'PIPE-DEL', componentType: 'PIPE', sourceRefs: [delRef] });
  linkMgr.registerComponent(compDel);

  assert.throws(
    () => resolver.resolve('PIPE-DEL', doc),
    (err) => err.code === 'MISSING_SOURCE_ENTITY'
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-05: Read-only targets: readOnly doc, readOnly entity, locked layer, frozen layer
// ---------------------------------------------------------------------------
test('ADV-A11-05: Read-only targets reject with READ_ONLY_TARGET', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });

  // 1. Entity on locked layer
  const lockedEntity = new DxfEntity({ id: 'doc:test:locked:01', layerId: 'LOCKED_LAYER' });
  doc.addEntity(lockedEntity);
  const lockedRef = new SourceRef({ cadEntityId: 'doc:test:locked:01', sourceRevision: 1 });
  const compLocked = new SemanticComponentRef({ componentId: 'PIPE-LOCKED', componentType: 'PIPE', sourceRefs: [lockedRef] });
  linkMgr.registerComponent(compLocked);

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });

  assert.throws(
    () => resolver.resolve('PIPE-LOCKED', doc),
    (err) => err.code === 'READ_ONLY_TARGET' && err.locked === true
  );

  // 2. Entity on frozen layer
  const frozenEntity = new DxfEntity({ id: 'doc:test:frozen:01', layerId: 'FROZEN_LAYER' });
  doc.addEntity(frozenEntity);
  const frozenRef = new SourceRef({ cadEntityId: 'doc:test:frozen:01', sourceRevision: 1 });
  const compFrozen = new SemanticComponentRef({ componentId: 'PIPE-FROZEN', componentType: 'PIPE', sourceRefs: [frozenRef] });
  linkMgr.registerComponent(compFrozen);

  assert.throws(
    () => resolver.resolve('PIPE-FROZEN', doc),
    (err) => err.code === 'READ_ONLY_TARGET' && err.frozen === true
  );

  // 3. Entity marked readOnly
  const roEntity = new DxfEntity({ id: 'doc:test:ro:01', layerId: 'PIPES' });
  roEntity.readOnly = true;
  doc.addEntity(roEntity);
  const roRef = new SourceRef({ cadEntityId: 'doc:test:ro:01', sourceRevision: 1 });
  const compRo = new SemanticComponentRef({ componentId: 'PIPE-RO', componentType: 'PIPE', sourceRefs: [roRef] });
  linkMgr.registerComponent(compRo);

  assert.throws(
    () => resolver.resolve('PIPE-RO', doc),
    (err) => err.code === 'READ_ONLY_TARGET' && err.entityId === 'doc:test:ro:01'
  );

  // 4. Whole document readOnly
  const roDoc = createFixtureDoc('doc:ro', 1);
  roDoc.diagnostics.push({ severity: 'error', message: 'Fatal read-only' });
  const linkMgrRo = new SemanticLinkManager({ documentId: 'doc:ro', sourceRevision: 1 });
  const refRo = new SourceRef({ cadEntityId: `${roDoc.id}:line:10`, sourceRevision: 1 });
  linkMgrRo.registerComponent(new SemanticComponentRef({ componentId: 'PIPE-RO-DOC', componentType: 'PIPE', sourceRefs: [refRo] }));
  const resolverRo = new SemanticSelectionResolver({ linkManager: linkMgrRo });

  assert.throws(
    () => resolverRo.resolve('PIPE-RO-DOC', roDoc),
    (err) => err.code === 'READ_ONLY_TARGET'
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-06: Unsupported occurrence targets and override
// ---------------------------------------------------------------------------
test('ADV-A11-06: Nested occurrence targets reject unless allowOccurrence is set', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });

  const occRef = new SourceRef({
    cadEntityId: `${doc.id}:line:10`,
    sourceRevision: 1,
    occurrencePath: [{ blockName: 'VALVE_ASSY', insertId: 'ins:1' }],
  });
  const compOcc = new SemanticComponentRef({ componentId: 'VALVE-NESTED', componentType: 'VALVE', sourceRefs: [occRef] });
  linkMgr.registerComponent(compOcc);

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });

  // Default: rejects
  assert.throws(
    () => resolver.resolve('VALVE-NESTED', doc),
    (err) => err.code === 'UNSUPPORTED_OCCURRENCE_TARGET'
  );

  // Override allowOccurrence: true
  const res = resolver.resolve('VALVE-NESTED', doc, { allowOccurrence: true });
  assert.equal(res.count, 1);
  assert.equal(res.nativeEntityIds[0], `${doc.id}:line:10`);
});

// ---------------------------------------------------------------------------
// ADV-A11-07: Dispatcher input guards: INVALID_OPERATION, MISSING_DOCUMENT, EMPTY_SELECTION
// ---------------------------------------------------------------------------
test('ADV-A11-07: Dispatcher input guards reject with dedicated error codes', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver });

  // 1. Invalid operation object / type
  assert.throws(
    () => dispatcher.dispatch(null, doc),
    (err) => err.code === 'INVALID_OPERATION'
  );
  assert.throws(
    () => dispatcher.dispatch({ type: 123 }, doc),
    (err) => err.code === 'INVALID_OPERATION'
  );

  // 2. Missing document
  assert.throws(
    () => dispatcher.dispatch({ type: 'MOVE', target: 'PIPE-001' }, null),
    (err) => err.code === 'MISSING_DOCUMENT'
  );

  // 3. Empty selection
  assert.throws(
    () => dispatcher.dispatch({ type: 'MOVE', target: [] }, doc),
    (err) => err.code === 'EMPTY_SELECTION'
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-08: Unsupported semantic operations rejected with UNSUPPORTED_OPERATION
// ---------------------------------------------------------------------------
test('ADV-A11-08: Unsupported operations reject explicitly without invented wiring', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const ref = new SourceRef({ cadEntityId: `${doc.id}:line:10`, sourceRevision: 1 });
  linkMgr.registerComponent(new SemanticComponentRef({ componentId: 'PIPE-001', componentType: 'PIPE', sourceRefs: [ref] }));

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver });

  const unsupportedOps = ['EXTRUDE', 'EXPLODE_CEG', 'EXPORT_PCF', 'CONVERT_TO_STEP', 'WELD'];
  for (const opType of unsupportedOps) {
    assert.throws(
      () => dispatcher.dispatch({ type: opType, target: 'PIPE-001' }, doc),
      (err) => err.code === 'UNSUPPORTED_OPERATION' && err.operationType === opType
    );
  }
});

// ---------------------------------------------------------------------------
// ADV-A11-09: Invalid argument validation for CHANGE_LAYER and CHANGE_PROPERTIES
// ---------------------------------------------------------------------------
test('ADV-A11-09: Invalid argument validation for CHANGE_LAYER and CHANGE_PROPERTIES', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const ref = new SourceRef({ cadEntityId: `${doc.id}:line:10`, sourceRevision: 1 });
  linkMgr.registerComponent(new SemanticComponentRef({ componentId: 'PIPE-001', componentType: 'PIPE', sourceRefs: [ref] }));

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver });

  // CHANGE_LAYER missing targetLayer
  assert.throws(
    () => dispatcher.dispatch({ type: 'CHANGE_LAYER', target: 'PIPE-001' }, doc),
    (err) => err.code === 'INVALID_ARGUMENT'
  );

  // CHANGE_PROPERTIES missing properties
  assert.throws(
    () => dispatcher.dispatch({ type: 'CHANGE_PROPERTIES', target: 'PIPE-001' }, doc),
    (err) => err.code === 'INVALID_ARGUMENT'
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-10: Parameter aliases for MOVE, ROTATE, SCALE
// ---------------------------------------------------------------------------
test('ADV-A11-10: Parameter aliases for MOVE, ROTATE, SCALE are accepted', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const ref = new SourceRef({ cadEntityId: `${doc.id}:line:10`, sourceRevision: 1 });
  linkMgr.registerComponent(new SemanticComponentRef({ componentId: 'PIPE-001', componentType: 'PIPE', sourceRefs: [ref] }));

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver });

  // 1. MOVE with delta alias
  const moveRes = dispatcher.dispatch({ type: 'MOVE', target: 'PIPE-001', delta: { x: 5, y: 10, z: 0 } }, doc);
  assert.equal(moveRes.operationType, 'MOVE');
  assert.equal(moveRes.nativeCommand.dx, 5);
  assert.equal(moveRes.nativeCommand.dy, 10);

  // Synchronize linkMgr to advanced revision for next test command
  linkMgr.sourceRevision = doc.revision;

  // 2. ROTATE with rotationDeg alias
  const rotRes = dispatcher.dispatch({ type: 'ROTATE', target: 'PIPE-001', rotationDeg: 90, center: { x: 0, y: 0 } }, doc);
  assert.equal(rotRes.operationType, 'ROTATE');
  assert.equal(rotRes.nativeCommand.angleDeg, 90);

  // Synchronize linkMgr to advanced revision for next test command
  linkMgr.sourceRevision = doc.revision;

  // 3. SCALE with scaleFactor alias
  const scaleRes = dispatcher.dispatch({ type: 'SCALE', target: 'PIPE-001', scaleFactor: 2.0, center: { x: 0, y: 0 } }, doc);
  assert.equal(scaleRes.operationType, 'SCALE');
  assert.equal(scaleRes.nativeCommand.sx, 2.0);
  assert.equal(scaleRes.nativeCommand.sy, 2.0);
});

// ---------------------------------------------------------------------------
// ADV-A11-11: Transaction port execution with automatic post-mutation staleness
// ---------------------------------------------------------------------------
test('ADV-A11-11: CommandHistory transaction advances revision and causes subsequent STALE_REVISION', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const ref = new SourceRef({ cadEntityId: `${doc.id}:line:10`, sourceRevision: 1 });
  linkMgr.registerComponent(new SemanticComponentRef({ componentId: 'PIPE-001', componentType: 'PIPE', sourceRefs: [ref] }));

  const history = new CommandHistory();
  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver, commandHistory: history });

  // Initial state: rev 1
  assert.equal(doc.revision, 1);

  // Dispatch MOVE operation through CommandHistory
  const dispatchResult = dispatcher.dispatch(
    { type: 'MOVE', target: 'PIPE-001', dx: 10, dy: 0 },
    doc
  );

  assert.equal(dispatchResult.operationType, 'MOVE');
  assert.ok(dispatchResult.changeSet != null);
  assert.equal(dispatchResult.resultRevision, 2);
  assert.equal(doc.revision, 2);

  // Now the document revision is 2, but linkMgr is still at revision 1!
  // Subsequent attempt to resolve or dispatch must be rejected as STALE_REVISION
  assert.throws(
    () => resolver.resolve('PIPE-001', doc),
    (err) => err.code === 'STALE_REVISION'
  );
  assert.throws(
    () => dispatcher.dispatch({ type: 'MOVE', target: 'PIPE-001', dx: 5 }, doc),
    (err) => err.code === 'STALE_REVISION'
  );
});

// ---------------------------------------------------------------------------
// ADV-A11-12: Immutability invariants and Object.freeze robustness
// ---------------------------------------------------------------------------
test('ADV-A11-12: SemanticSelectionResult is frozen and robust under frozen input', () => {
  const doc = createFixtureDoc('doc:test', 1);
  const linkMgr = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });
  const ref = new SourceRef({ cadEntityId: `${doc.id}:line:10`, sourceRevision: 1 });
  linkMgr.registerComponent(new SemanticComponentRef({ componentId: 'PIPE-001', componentType: 'PIPE', sourceRefs: [ref] }));

  const resolver = new SemanticSelectionResolver({ linkManager: linkMgr });

  // Frozen inputs
  const frozenSelection = Object.freeze(['PIPE-001']);
  const frozenOptions = Object.freeze({ allowOccurrence: false });

  const result = resolver.resolve(frozenSelection, doc, frozenOptions);

  assert.ok(Object.isFrozen(result.nativeEntityIds));
  assert.ok(Object.isFrozen(result.components));
  assert.equal(result.count, 1);

  // Serializes cleanly
  const json = result.toJSON();
  assert.deepEqual(json.componentIds, ['PIPE-001']);
  assert.deepEqual(json.nativeEntityIds, [`${doc.id}:line:10`]);
});
