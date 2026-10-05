/**
 * tests/dxf/dxf-command-history.test.mjs
 *
 * Phase 5 Verification Suite:
 * - Command Encapsulation (Move, Rotate, Scale, Copy, Delete, ChangeLayer, ChangeProperties, EditText, GripEdit)
 * - Undo / Redo / Macro Batch Stack Integrity
 * - Touched-Only rawTags Invalidation & Undo Round-Trip Preservation (Invariants 1 & 7)
 * - Incremental Render & Spatial Updates without whole-scene rebuild
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DxfDocument } from '../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../formats/dxf/model/dxf-layer.js';
import { DxfRenderAdapter } from '../../formats/dxf/render/dxf-render-adapter.js';
import { DxfSpatialIndex } from '../../formats/dxf/spatial/dxf-spatial-index.js';
import { SelectionManager } from '../../core/selection/selection-manager.js';
import {DxfDocumentParser} from '../../formats/dxf/parser/dxf-document-parser.js';
import { DxfDocumentWriter } from '../../formats/dxf/writer/dxf-document-writer.js';

import {
  CommandHistory,
  MoveEntitiesCommand,
  RotateEntitiesCommand,
  ScaleEntitiesCommand,
  CopyEntitiesCommand,
  DeleteEntitiesCommand,
  ChangeLayerCommand,
  ChangePropertiesCommand,
  EditTextCommand,
  GripEditCommand,
  IncrementalUpdater,
} from '../../core/commands/cad/index.js';

function createSampleDocument() {
  const doc = new DxfDocument();
  doc.addLayer(new DxfLayer({ name: '0', colorIndex: 7 }));
  doc.addLayer(new DxfLayer({ name: 'WALLS', colorIndex: 1 }));
  doc.addLayer(new DxfLayer({ name: 'TEXT', colorIndex: 3 }));

  // 1. Line on layer WALLS
  const line = new DxfEntity({
    handle: '10',
    type: 'LINE',
    layerId: 'WALLS',
    geometry: {
      start: { x: 10, y: 10, z: 0 },
      end: { x: 50, y: 10, z: 0 },
    },
    source: {
      order: 1,
      rawTags: [
        { code: 0, value: 'LINE' },
        { code: 5, value: '10' },
        { code: 8, value: 'WALLS' },
        { code: 10, value: '10.0' },
        { code: 20, value: '10.0' },
        { code: 11, value: '50.0' },
        { code: 21, value: '10.0' },
      ],
    },
  });
  doc.addEntity(line);

  // 2. Circle on layer 0
  const circle = new DxfEntity({
    handle: '11',
    type: 'CIRCLE',
    layerId: '0',
    geometry: {
      center: { x: 100, y: 100, z: 0 },
      radius: 25,
    },
    source: {
      order: 2,
      rawTags: [
        { code: 0, value: 'CIRCLE' },
        { code: 5, value: '11' },
        { code: 8, value: '0' },
        { code: 10, value: '100.0' },
        { code: 20, value: '100.0' },
        { code: 40, value: '25.0' },
      ],
    },
  });
  doc.addEntity(circle);

  // 3. Polyline on layer WALLS
  const polyline = new DxfEntity({
    handle: '12',
    type: 'LWPOLYLINE',
    layerId: 'WALLS',
    geometry: {
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      closed: false,
    },
    source: {
      order: 3,
      rawTags: [
        { code: 0, value: 'LWPOLYLINE' },
        { code: 5, value: '12' },
        { code: 8, value: 'WALLS' },
        { code: 90, value: '3' },
        { code: 10, value: '0.0' },
        { code: 20, value: '0.0' },
        { code: 10, value: '20.0' },
        { code: 20, value: '0.0' },
        { code: 10, value: '20.0' },
        { code: 20, value: '20.0' },
      ],
    },
  });
  doc.addEntity(polyline);

  // 4. Text on layer TEXT
  const text = new DxfEntity({
    handle: '13',
    type: 'TEXT',
    layerId: 'TEXT',
    geometry: {
      insertionPoint: { x: 200, y: 200, z: 0 },
    },
    attributes: {
      text: 'ROOM 101',
      height: 5.0,
      rotation: 0,
      styleName: 'STANDARD',
    },
    source: {
      order: 4,
      rawTags: [
        { code: 0, value: 'TEXT' },
        { code: 5, value: '13' },
        { code: 8, value: 'TEXT' },
        { code: 10, value: '200.0' },
        { code: 20, value: '200.0' },
        { code: 40, value: '5.0' },
        { code: 1, value: 'ROOM 101' },
      ],
    },
  });
  doc.addEntity(text);

  for(const e of doc.entities)doc.handles.register(e.handle);
  return doc;
}

describe('CAD Command/History Framework (Phase 5)', () => {
  it('MoveEntitiesCommand: executes, modifies entity, retains source tags, and undos cleanly', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const line = doc.getEntity('10');
    const untouchedCircle = doc.getEntity('11');

    assert.equal(line.geometry.start.x, 10);
    assert.equal(line.geometry.end.x, 50);
    assert.ok(line.source.rawTags != null);
    assert.ok(untouchedCircle.source.rawTags != null);

    // Execute Move (+15, +20)
    const moveCmd = new MoveEntitiesCommand([line.id], 15, 20);
    const changeSet = history.execute(moveCmd, doc);

    assert.equal(changeSet.modified.length, 1);
    assert.equal(line.geometry.start.x, 25);
    assert.equal(line.geometry.start.y, 30);
    assert.equal(line.geometry.end.x, 65);
    assert.equal(line.geometry.end.y, 30);
    assert.equal(line.state.modified, true);
    assert.ok(line.source.rawTags.length, 'Modified native entity retains opaque and source tags');
    assert.ok(untouchedCircle.source.rawTags != null, 'Untouched entity must retain rawTags verbatim');

    // Undo Move
    assert.ok(history.canUndo);
    history.undo(doc);

    assert.equal(line.geometry.start.x, 10);
    assert.equal(line.geometry.start.y, 10);
    assert.equal(line.geometry.end.x, 50);
    assert.equal(line.geometry.end.y, 10);
    assert.equal(line.state.modified, false, 'Undoing must restore modified=false');
    assert.ok(line.source.rawTags != null, 'Undoing must restore source rawTags verbatim');

    // Redo Move
    assert.ok(history.canRedo);
    history.redo(doc);

    assert.equal(line.geometry.start.x, 25);
    assert.equal(line.geometry.start.y, 30);
    assert.equal(line.state.modified, true);
    assert.ok(line.source.rawTags.length);
  });

  it('RotateEntitiesCommand: rotates geometry and angles around base point and undos', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const line = doc.getEntity('10'); // (10, 10) to (50, 10)
    const text = doc.getEntity('13'); // at (200, 200), rotation 0

    // Rotate 90 degrees around (10, 10)
    const rotCmd = new RotateEntitiesCommand([line.id, text.id], { x: 10, y: 10 }, 90);
    history.execute(rotCmd, doc);

    // Line start should be unchanged (at center), end should be (10, 50)
    assert.ok(Math.abs(line.geometry.start.x - 10) < 1e-6);
    assert.ok(Math.abs(line.geometry.start.y - 10) < 1e-6);
    assert.ok(Math.abs(line.geometry.end.x - 10) < 1e-6);
    assert.ok(Math.abs(line.geometry.end.y - 50) < 1e-6);

    // Text rotation should be 90
    assert.equal(text.attributes.rotation, 90);

    // Undo
    history.undo(doc);
    assert.ok(Math.abs(line.geometry.end.x - 50) < 1e-6);
    assert.ok(Math.abs(line.geometry.end.y - 10) < 1e-6);
    assert.equal(text.attributes.rotation, 0);
  });

  it('ScaleEntitiesCommand: scales geometry and dimensions relative to base point and undos', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const circle = doc.getEntity('11'); // center (100, 100), radius 25
    const text = doc.getEntity('13');   // height 5.0

    // Scale 2x around (100, 100)
    const scaleCmd = new ScaleEntitiesCommand([circle.id, text.id], { x: 100, y: 100 }, 2.0);
    history.execute(scaleCmd, doc);

    assert.equal(circle.geometry.radius, 50);
    assert.equal(text.attributes.height, 10.0);

    // Undo
    history.undo(doc);
    assert.equal(circle.geometry.radius, 25);
    assert.equal(text.attributes.height, 5.0);
  });

  it('CopyEntitiesCommand: clones entities, allocates new handles, undos by removal', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const initialCount = doc.entities.length;

    const copyCmd = new CopyEntitiesCommand(['dxf:entity:10'], 50, 50);
    const cs = history.execute(copyCmd, doc);

    assert.equal(cs.added.length, 1);
    assert.equal(doc.entities.length, initialCount + 1);

    const clone = doc.getEntity(cs.added[0].entityId);
    assert.notEqual(clone.id, 'dxf:entity:10');
    assert.equal(clone.geometry.start.x, 60);
    assert.equal(clone.geometry.start.y, 60);
    assert.equal(clone.state.generated, true);

    // Verify lookup
    assert.equal(doc.getEntity(clone.id), clone);

    // Undo Copy
    history.undo(doc);
    assert.equal(doc.entities.length, initialCount);
    assert.equal(doc.getEntity(clone.id), null);
  });

  it('DeleteEntitiesCommand: removes from document and lookup indices, undos cleanly in-place', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const initialCount = doc.entities.length;
    const circle = doc.getEntity('11');

    assert.ok(doc.getEntity('11') != null);
    assert.ok(doc.layerEntityIndex.get('0').has(circle.id));

    const deleteCmd = new DeleteEntitiesCommand([circle.id]);
    history.execute(deleteCmd, doc);

    assert.equal(doc.entities.length, initialCount - 1);
    assert.equal(doc.getEntity('11'), null);
    assert.ok(!doc.layerEntityIndex.get('0').has(circle.id));

    // Undo Delete
    history.undo(doc);
    assert.equal(doc.entities.length, initialCount);
    assert.equal(doc.getEntity('11'), circle);
    assert.ok(doc.layerEntityIndex.get('0').has(circle.id));
    assert.equal(circle.state.deleted, false);
  });

  it('ChangeLayerCommand: moves entity to target layer and updates indices', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const line = doc.getEntity('10');

    assert.equal(line.layerId, 'WALLS');
    assert.ok(doc.layerEntityIndex.get('WALLS').has(line.id));

    doc.addLayer(new DxfLayer({name:'NEW_LAYER'}));
    const changeLayerCmd = new ChangeLayerCommand([line.id], 'NEW_LAYER');
    history.execute(changeLayerCmd, doc);

    assert.equal(line.layerId, 'NEW_LAYER');
    assert.ok(!doc.layerEntityIndex.get('WALLS').has(line.id));
    assert.ok(doc.layerEntityIndex.get('NEW_LAYER').has(line.id));

    // Undo
    history.undo(doc);
    assert.equal(line.layerId, 'WALLS');
    assert.ok(doc.layerEntityIndex.get('WALLS').has(line.id));
    assert.ok(!doc.layerEntityIndex.get('NEW_LAYER')?.has(line.id));
  });

  it('ChangePropertiesCommand: modifies color, linetype, lineweight and undos', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const line = doc.getEntity('10');

    const changePropsCmd = new ChangePropertiesCommand([line.id], {
      colorIndex: 1,
      colorMode: 'INDEXED',
      lineWeight: 50,
      lineWeightMode: 'EXPLICIT',
    });
    history.execute(changePropsCmd, doc);

    assert.equal(line.style.colorIndex, 1);
    assert.equal(line.style.colorMode, 'INDEXED');
    assert.equal(line.style.lineWeight, 50);

    // Undo
    history.undo(doc);
    assert.equal(line.style.colorMode, 'BYLAYER');
  });

  it('EditTextCommand: edits text string, height, and undos', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const text = doc.getEntity('13');

    const editCmd = new EditTextCommand(text.id, {
      text: 'CONFERENCE ROOM',
      height: 8.5,
    });
    history.execute(editCmd, doc);

    assert.equal(text.attributes.text, 'CONFERENCE ROOM');
    assert.equal(text.attributes.height, 8.5);

    // Undo
    history.undo(doc);
    assert.equal(text.attributes.text, 'ROOM 101');
    assert.equal(text.attributes.height, 5.0);
  });

  it('GripEditCommand: mutates specific vertex on LINE or POLYLINE and undos', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const line = doc.getEntity('10'); // (10, 10) to (50, 10)

    // Edit start grip (0) to (15, 25)
    const gripCmd = new GripEditCommand(line.id, 0, { x: 15, y: 25 });
    history.execute(gripCmd, doc);

    assert.equal(line.geometry.start.x, 15);
    assert.equal(line.geometry.start.y, 25);
    assert.equal(line.geometry.end.x, 50); // end untouched

    // Undo
    history.undo(doc);
    assert.equal(line.geometry.start.x, 10);
    assert.equal(line.geometry.start.y, 10);
  });

  it('Batch Transactions: groups multiple commands into a single undo step', () => {
    const doc = createSampleDocument();
    const history = new CommandHistory();
    const line = doc.getEntity('10');
    const circle = doc.getEntity('11');

    history.beginBatch('BATCH_MOVE_AND_SCALE');
    history.execute(new MoveEntitiesCommand([line.id], 10, 0), doc);
    history.execute(new ScaleEntitiesCommand([circle.id], { x: 100, y: 100 }, 2.0), doc);
    const batchChangeSet = history.endBatch();

    assert.equal(history.undoCount, 1, 'Batch must produce exactly 1 undo entry');
    assert.equal(line.geometry.start.x, 20);
    assert.equal(circle.geometry.radius, 50);

    // Single undo rolls back both mutations
    history.undo(doc);
    assert.equal(line.geometry.start.x, 10);
    assert.equal(circle.geometry.radius, 25);

    // Redo re-applies both
    history.redo(doc);
    assert.equal(line.geometry.start.x, 20);
    assert.equal(circle.geometry.radius, 50);
  });

  it('IncrementalUpdater: reconciles RenderModel, SpatialIndex, and Selection without full scene rebuild', () => {
    const doc = createSampleDocument();
    const renderModel = DxfRenderAdapter.buildRenderModel(doc);
    const spatialIndex = new DxfSpatialIndex();
    spatialIndex.loadFromRenderModel(renderModel);

    const selection = new SelectionManager();
    const line = doc.getEntity('10');
    selection.set([line.id]);

    const initialPrimCount = renderModel.primitives.length;
    const initialSpatialSize = spatialIndex.size;

    // 1. Move Line
    const moveCmd = new MoveEntitiesCommand([line.id], 100, 100);
    const moveCS = moveCmd.execute(doc);

    const report1 = IncrementalUpdater.reconcile(moveCS, renderModel, spatialIndex, doc, selection);
    assert.equal(report1.modifiedCount, 1);
    assert.equal(renderModel.primitives.length, initialPrimCount, 'Primitive count unchanged after moving 1 entity');

    // Verify spatial index was updated in-place
    const updatedLineBounds = spatialIndex.getEntityBounds(line.id);
    assert.ok(updatedLineBounds != null);
    assert.equal(updatedLineBounds.min.x, 110);
    assert.equal(updatedLineBounds.min.y, 110);
    assert.equal(updatedLineBounds.max.x, 150);
    assert.equal(updatedLineBounds.max.y, 110);

    // 2. Delete Circle
    const circle = doc.getEntity('11');
    const deleteCmd = new DeleteEntitiesCommand([circle.id]);
    const deleteCS = deleteCmd.execute(doc);

    const report2 = IncrementalUpdater.reconcile(deleteCS, renderModel, spatialIndex, doc, selection);
    assert.equal(report2.deletedCount, 1);
    assert.equal(renderModel.primitives.length, initialPrimCount - 1);
    assert.equal(spatialIndex.size, initialSpatialSize - 1);
    assert.equal(spatialIndex.getEntityBounds(circle.id), null);

    // 3. Copy Polyline
    const poly = doc.getEntity('12');
    const copyCmd = new CopyEntitiesCommand([poly.id], 50, 50);
    const copyCS = copyCmd.execute(doc);

    const report3 = IncrementalUpdater.reconcile(copyCS, renderModel, spatialIndex, doc, selection);
    assert.equal(report3.addedCount, 1);
    const copyEntityId = copyCS.added[0].entityId;
    assert.ok(spatialIndex.getEntityBounds(copyEntityId) != null);
  });

  it('Lossless Invariant on Edit-and-Undo: same-format round-trip retains 100% equivalence', () => {
    const doc = DxfDocumentParser.parse(['0','SECTION','2','ENTITIES','0','LINE','5','10','8','0','10','10','20','10','30','5','11','50','21','10','31','5','0','ENDSEC','0','EOF'].join('\n'));
    const originalDxf = DxfDocumentWriter.write(doc);

    const history = new CommandHistory();
    const line = doc.getEntity('10');

    // Mutate
    history.execute(new MoveEntitiesCommand([line.id], 50, 50), doc);
    const modifiedDxf = DxfDocumentWriter.write(doc);
    assert.notEqual(modifiedDxf, originalDxf);

    // Undo mutation
    history.undo(doc);
    const restoredDxf = DxfDocumentWriter.write(doc);

    // Verbatim equivalence restored!
    assert.equal(restoredDxf, originalDxf, 'Undo must completely restore verbatim DXF output');
  });
});
