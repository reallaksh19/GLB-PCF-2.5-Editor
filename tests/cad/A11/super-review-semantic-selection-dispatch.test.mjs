import test from 'node:test';
import assert from 'node:assert/strict';

import { DxfDocument } from '../../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../../formats/dxf/model/dxf-layer.js';
import { CommandHistory } from '../../../core/commands/cad/command-history.js';
import {
  SourceRef,
  SemanticComponentRef,
  SemanticLinkManager,
  SemanticSelectionResolver,
} from '../../../formats/cad/semantic-links/index.js';
import {
  SemanticCommandDispatcher,
} from '../../../formats/dxf/semantic/semantic-command-dispatcher.js';

function makeDoc({ id = 'sr112:doc', revision = 7 } = {}) {
  const doc = new DxfDocument({ id });
  doc.revision = revision;
  doc.addLayer(new DxfLayer({ name: 'PIPING' }));
  doc.addLayer(new DxfLayer({ name: 'LOCKED', locked: true }));
  doc.addLayer(new DxfLayer({ name: 'FROZEN', frozen: true }));
  return doc;
}

function addLine(doc, { id = 'sr112:line', layerId = 'PIPING', end = { x: 2, y: 3, z: 4 } } = {}) {
  const entity = new DxfEntity({
    id,
    handle: 'A1',
    type: 'LINE',
    layerId,
    geometry: { start: { x: 0, y: 0, z: 0 }, end: { ...end } },
  });
  doc.addEntity(entity);
  return entity;
}

function addCircle(doc, { id = 'sr112:circle' } = {}) {
  const entity = new DxfEntity({
    id,
    handle: 'C1',
    type: 'CIRCLE',
    layerId: 'PIPING',
    geometry: { center: { x: 0, y: 0, z: 0 }, radius: 5 },
  });
  doc.addEntity(entity);
  return entity;
}

function link(doc, entity, {
  componentId = 'SEM-1',
  sourceRevision = doc.revision,
  sourceDocumentId = doc.id,
  occurrencePath = [],
} = {}) {
  const manager = new SemanticLinkManager({ documentId: doc.id, sourceRevision: doc.revision });
  manager.registerComponent(new SemanticComponentRef({
    componentId,
    componentType: 'PIPE',
    sourceRefs: [new SourceRef({
      cadEntityId: entity.id,
      documentId: sourceDocumentId,
      sourceRevision,
      occurrencePath,
    })],
  }));
  const resolver = new SemanticSelectionResolver({ linkManager: manager, documentId: doc.id });
  return { manager, resolver, componentId };
}

function dispatcherWithHistory(resolver) {
  const history = new CommandHistory();
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver, commandHistory: history });
  return { dispatcher, history };
}

function snapshot(doc) {
  return JSON.stringify({
    revision: doc.revision,
    entities: doc.entities.map(e => ({ id: e.id, layerId: e.layerId, geometry: e.geometry, style: e.style, state: e.state })),
  });
}

test('SR112-01 exact native resolution uses authoritative DxfDocument identity', () => {
  const doc = makeDoc();
  const line = addLine(doc);
  const { resolver, componentId } = link(doc, line);
  const result = resolver.resolve(componentId, doc);
  assert.deepEqual(result.nativeEntityIds, [line.id]);
  assert.equal(result.documentId, doc.id);
  assert.equal(result.sourceRevision, doc.revision);
});

test('SR112-02 stale SourceRef revision rejects even when manager revision is current', () => {
  const doc = makeDoc({ revision: 7 });
  const line = addLine(doc);
  const { resolver, componentId } = link(doc, line, { sourceRevision: 6 });
  assert.throws(() => resolver.resolve(componentId, doc), err => err?.code === 'STALE_REVISION');
});

test('SR112-03 SourceRef document mismatch rejects before native lookup/mutation', () => {
  const doc = makeDoc();
  const line = addLine(doc);
  const { resolver, componentId } = link(doc, line, { sourceDocumentId: 'other:doc' });
  assert.throws(() => resolver.resolve(componentId, doc), err => err?.code === 'DOCUMENT_MISMATCH');
});

test('SR112-04 read-only, locked, frozen and missing targets fail closed', () => {
  for (const mode of ['document', 'locked', 'frozen', 'missing']) {
    const doc = makeDoc();
    const line = addLine(doc, { layerId: mode === 'locked' ? 'LOCKED' : mode === 'frozen' ? 'FROZEN' : 'PIPING' });
    const { resolver, componentId } = link(doc, line);
    if (mode === 'document') doc.diagnostics.push({ severity: 'error', code: 'PARSE_ERROR' });
    if (mode === 'missing') doc.removeEntity(line.id);
    const before = snapshot(doc);
    assert.throws(
      () => resolver.resolve(componentId, doc),
      err => ['READ_ONLY_TARGET', 'MISSING_SOURCE_ENTITY'].includes(err?.code),
    );
    assert.equal(snapshot(doc), before);
  }
});

test('SR112-05 semantic mutation cannot bypass unsupported occurrence rejection', () => {
  const doc = makeDoc();
  const line = addLine(doc);
  const { resolver, componentId } = link(doc, line, { occurrencePath: [{ insertId: 'I1', row: 0, column: 0 }] });
  const { dispatcher, history } = dispatcherWithHistory(resolver);
  const before = snapshot(doc);
  assert.throws(
    () => dispatcher.dispatch({ type: 'MOVE', target: componentId, dx: 5 }, doc, { allowOccurrence: true }),
    err => err?.code === 'UNSUPPORTED_OCCURRENCE_TARGET',
  );
  assert.equal(snapshot(doc), before);
  assert.equal(history.undoCount, 0);
});

test('SR112-06 dispatcher requires the A09 CommandHistory transaction port', () => {
  const doc = makeDoc();
  const line = addLine(doc);
  const { resolver, componentId } = link(doc, line);
  const dispatcher = new SemanticCommandDispatcher({ selectionResolver: resolver });
  const before = snapshot(doc);
  assert.throws(
    () => dispatcher.dispatch({ type: 'MOVE', target: componentId, dx: 5 }, doc),
    err => err?.code === 'MISSING_COMMAND_HISTORY',
  );
  assert.equal(snapshot(doc), before);
});

test('SR112-07 MOVE executes through real history, advances revision, undo restores native geometry', () => {
  const doc = makeDoc({ revision: 3 });
  const line = addLine(doc, { end: { x: 10, y: 0, z: 5 } });
  const { manager, resolver, componentId } = link(doc, line);
  const { dispatcher, history } = dispatcherWithHistory(resolver);
  const result = dispatcher.dispatch({ type: 'MOVE', target: componentId, delta: { x: 2, y: 4, z: 1 } }, doc);
  assert.equal(result.resultRevision, 4);
  assert.deepEqual(line.geometry.start, { x: 2, y: 4, z: 1 });
  assert.deepEqual(line.geometry.end, { x: 12, y: 4, z: 6 });
  assert.equal(history.undoCount, 1);
  assert.equal(manager.isFresh(doc.revision), false);
  history.undo(doc);
  assert.equal(doc.revision, 5);
  assert.deepEqual(line.geometry.start, { x: 0, y: 0, z: 0 });
  assert.deepEqual(line.geometry.end, { x: 10, y: 0, z: 5 });
});

test('SR112-08 malformed numeric transform operands reject without revision/history/source mutation', () => {
  for (const operation of [
    { type: 'MOVE', dx: 'not-a-number', dy: 1 },
    { type: 'ROTATE', angleDeg: 'not-a-number', center: { x: 0, y: 0, z: 0 } },
    { type: 'SCALE', sx: 'not-a-number', sy: 2, sz: 3, center: { x: 0, y: 0, z: 0 } },
  ]) {
    const doc = makeDoc();
    const line = addLine(doc);
    const { resolver, componentId } = link(doc, line);
    const { dispatcher, history } = dispatcherWithHistory(resolver);
    const before = snapshot(doc);
    assert.throws(() => dispatcher.dispatch({ ...operation, target: componentId }, doc));
    assert.equal(snapshot(doc), before);
    assert.equal(history.undoCount, 0);
  }
});

test('SR112-09 nonuniform SCALE preserves exact native A09 scale factors', () => {
  const doc = makeDoc();
  const line = addLine(doc, { end: { x: 2, y: 3, z: 4 } });
  const { resolver, componentId } = link(doc, line);
  const { dispatcher } = dispatcherWithHistory(resolver);
  const result = dispatcher.dispatch({ type: 'SCALE', target: componentId, center: { x: 0, y: 0, z: 0 }, sx: 2, sy: 3, sz: 4 }, doc);
  assert.equal(result.nativeCommand.sx, 2);
  assert.equal(result.nativeCommand.sy, 3);
  assert.equal(result.nativeCommand.sz, 4);
  assert.deepEqual(line.geometry.end, { x: 4, y: 9, z: 16 });
});

test('SR112-10 unsupported nonuniform CIRCLE scale rejects atomically through A09 validation', () => {
  const doc = makeDoc();
  const circle = addCircle(doc);
  const { resolver, componentId } = link(doc, circle);
  const { dispatcher, history } = dispatcherWithHistory(resolver);
  const before = snapshot(doc);
  assert.throws(
    () => dispatcher.dispatch({ type: 'SCALE', target: componentId, center: { x: 0, y: 0, z: 0 }, sx: 2, sy: 3, sz: 1 }, doc),
    /nonuniform/i,
  );
  assert.equal(snapshot(doc), before);
  assert.equal(history.undoCount, 0);
});

test('SR112-11 unavailable target layer and invalid properties reject atomically', () => {
  for (const operation of [
    { type: 'CHANGE_LAYER', targetLayer: 'DOES_NOT_EXIST' },
    { type: 'CHANGE_LAYER', targetLayer: 'LOCKED' },
    { type: 'CHANGE_LAYER', targetLayer: 'FROZEN' },
    { type: 'CHANGE_PROPERTIES', properties: { colorIndex: 999 } },
  ]) {
    const doc = makeDoc();
    const line = addLine(doc);
    const { resolver, componentId } = link(doc, line);
    const { dispatcher, history } = dispatcherWithHistory(resolver);
    const before = snapshot(doc);
    assert.throws(() => dispatcher.dispatch({ ...operation, target: componentId }, doc));
    assert.equal(snapshot(doc), before);
    assert.equal(history.undoCount, 0);
  }
});

test('SR112-12 unsupported/unrecognized/ambiguous selection never mutates source', () => {
  const doc = makeDoc();
  const line = addLine(doc);
  const manager = new SemanticLinkManager({ documentId: doc.id, sourceRevision: doc.revision });
  for (const id of ['SEM-A', 'SEM-B']) manager.registerComponent(new SemanticComponentRef({
    componentId: id,
    componentType: 'PIPE',
    sourceRefs: [new SourceRef({ cadEntityId: line.id, documentId: doc.id, sourceRevision: doc.revision })],
  }));
  const resolver = new SemanticSelectionResolver({ linkManager: manager, documentId: doc.id });
  const { dispatcher, history } = dispatcherWithHistory(resolver);
  const before = snapshot(doc);
  assert.throws(() => dispatcher.dispatch({ type: 'MOVE', target: line.id, dx: 1 }, doc), err => err?.code === 'AMBIGUOUS_SELECTION');
  assert.throws(() => dispatcher.dispatch({ type: 'MOVE', target: 'UNKNOWN', dx: 1 }, doc), err => err?.code === 'UNRECOGNIZED_COMPONENT');
  assert.equal(snapshot(doc), before);
  assert.equal(history.undoCount, 0);
});
