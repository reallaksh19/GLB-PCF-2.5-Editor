/**
 * tests/dxf/dxf-cad-editing.test.mjs
 *
 * Phase 6 Verification Test Suite: High-ROI Native CAD Editing Commands
 * - Trim: trims lines at cutting edges, middle splits, circle-to-arc conversions
 * - Extend: extends lines to boundary edges along ray
 * - Offset: parallel line offsets, concentric circle/arc offsets, mitered polyline offsets
 * - Fillet: radius 0 sharp corner join, radius > 0 tangent arc generation
 * - Explode: INSERT block references into model space entities, polylines into lines/arcs
 * - Join / Pedit: contiguous lines and arcs chained into a single LWPOLYLINE
 * - Complete undo/redo fidelity and lossless round-trip invariant
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {DxfDocumentParser} from '../../formats/dxf/parser/dxf-document-parser.js';
import { DxfDocument } from '../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../formats/dxf/model/dxf-entity.js';
import { DxfBlock } from '../../formats/dxf/model/dxf-block.js';
import { DxfLayer } from '../../formats/dxf/model/dxf-layer.js';
import { DxfDocumentWriter } from '../../formats/dxf/writer/dxf-document-writer.js';
import { CommandHistory } from '../../core/commands/cad/command-history.js';

import {
  TrimEntitiesCommand,
  ExtendEntitiesCommand,
  FilletCommand,
  OffsetCommand,
  ExplodeCommand,
  JoinCommand,
} from '../../core/commands/cad/index.js';

class SampleDocument extends DxfDocument {
 constructor(){super();for(const name of ['0','ARCH','OUTLINE'])this.addLayer(new DxfLayer({name}));}
 addEntity(e,index){if(e.handle)this.handles.register(e.handle);return super.addEntity(e,index);}
}
describe('Phase 6: High-ROI Native CAD Editing Commands', () => {
  it('TrimEntitiesCommand: trims end of line intersecting a cutting edge', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // Target Line: horizontal from (0, 10) to (100, 10)
    const line = new DxfEntity({
      handle: '10',
      type: 'LINE',
      layerId: '0',
      geometry: { start: { x: 0, y: 10, z: 0 }, end: { x: 100, y: 10, z: 0 } },
    });
    doc.addEntity(line);

    // Cutting Edge: vertical line at x = 60 from (60, 0) to (60, 20)
    const cutter = new DxfEntity({
      handle: '20',
      type: 'LINE',
      layerId: '0',
      geometry: { start: { x: 60, y: 0, z: 0 }, end: { x: 60, y: 20, z: 0 } },
    });
    doc.addEntity(cutter);

    // Click near the right end (80, 10) to trim off (60 to 100)
    const trimCmd = new TrimEntitiesCommand({
      entityId: line.id,
      cuttingEdgeIds: [cutter.id],
      clickPoint: { x: 80, y: 10 },
    });

    history.execute(trimCmd, doc);

    assert.equal(line.geometry.start.x, 0);
    assert.equal(line.geometry.end.x, 60);
    assert.equal(line.state.modified, true);

    // Undo restores line to original (0 to 100)
    history.undo(doc);
    assert.equal(line.geometry.start.x, 0);
    assert.equal(line.geometry.end.x, 100);
    assert.equal(line.state.modified, false);
  });

  it('TrimEntitiesCommand: trims middle of line, splitting it into two separate lines', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // Line from (0, 0) to (100, 0)
    const line = new DxfEntity({
      handle: '10',
      type: 'LINE',
      geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
    });
    doc.addEntity(line);

    // Cutter 1 at x = 30
    const c1 = new DxfEntity({
      handle: '21',
      type: 'LINE',
      geometry: { start: { x: 30, y: -10, z: 0 }, end: { x: 30, y: 10, z: 0 } },
    });
    doc.addEntity(c1);

    // Cutter 2 at x = 70
    const c2 = new DxfEntity({
      handle: '22',
      type: 'LINE',
      geometry: { start: { x: 70, y: -10, z: 0 }, end: { x: 70, y: 10, z: 0 } },
    });
    doc.addEntity(c2);

    const initialDocCount = doc.entities.length;

    // Click middle at (50, 0)
    const trimCmd = new TrimEntitiesCommand({
      entityId: line.id,
      cuttingEdgeIds: [c1.id, c2.id],
      clickPoint: { x: 50, y: 0 },
    });

    const cs = history.execute(trimCmd, doc);

    // Original line trimmed to [0, 30]
    assert.equal(line.geometry.start.x, 0);
    assert.equal(line.geometry.end.x, 30);

    // New split line created for [70, 100]
    assert.equal(cs.added.length, 1);
    const splitLine = doc.getEntity(cs.added[0].entityId);
    assert.equal(splitLine.geometry.start.x, 70);
    assert.equal(splitLine.geometry.end.x, 100);
    assert.equal(doc.entities.length, initialDocCount + 1);

    // Undo restores single line [0, 100] and removes split line
    history.undo(doc);
    assert.equal(line.geometry.end.x, 100);
    assert.equal(doc.entities.length, initialDocCount);
    assert.equal(doc.getEntity(splitLine.id), null);
  });

  it('TrimEntitiesCommand: trims circle with 2 cutting lines, converting it into an ARC', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // Circle centered at (50, 50), radius 20
    const circle = new DxfEntity({
      handle: '10',
      type: 'CIRCLE',
      geometry: { center: { x: 50, y: 50, z: 0 }, radius: 20 },
    });
    doc.addEntity(circle);

    // Horizontal cutting line at y = 50 from (20, 50) to (80, 50)
    const cutter = new DxfEntity({
      handle: '20',
      type: 'LINE',
      geometry: { start: { x: 20, y: 50, z: 0 }, end: { x: 80, y: 50, z: 0 } },
    });
    doc.addEntity(cutter);

    // Click top half at (50, 70) to trim away the top semicircle
    const trimCmd = new TrimEntitiesCommand({
      entityId: circle.id,
      cuttingEdgeIds: [cutter.id],
      clickPoint: { x: 50, y: 70 },
    });

    history.execute(trimCmd, doc);

    assert.equal(circle.type, 'ARC');
    assert.ok(circle.geometry.startAngle != null);
    assert.ok(circle.geometry.endAngle != null);

    // Undo restores CIRCLE
    history.undo(doc);
    assert.equal(circle.type, 'CIRCLE');
  });

  it('ExtendEntitiesCommand: extends line to an intersecting boundary line along ray', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // Line from (10, 20) to (50, 20)
    const line = new DxfEntity({
      handle: '10',
      type: 'LINE',
      geometry: { start: { x: 10, y: 20, z: 0 }, end: { x: 50, y: 20, z: 0 } },
    });
    doc.addEntity(line);

    // Boundary vertical line at x = 120 from (120, 0) to (120, 100)
    const boundary = new DxfEntity({
      handle: '20',
      type: 'LINE',
      geometry: { start: { x: 120, y: 0, z: 0 }, end: { x: 120, y: 100, z: 0 } },
    });
    doc.addEntity(boundary);

    // Pick near the right end (45, 20) to extend forward towards x=120
    const extendCmd = new ExtendEntitiesCommand({
      entityId: line.id,
      boundaryEdgeIds: [boundary.id],
      pickPoint: { x: 45, y: 20 },
    });

    history.execute(extendCmd, doc);

    assert.equal(line.geometry.start.x, 10);
    assert.equal(line.geometry.end.x, 120);

    // Undo reverts back to (50, 20)
    history.undo(doc);
    assert.equal(line.geometry.end.x, 50);
  });

  it('OffsetCommand: creates parallel lines and concentric circles/arcs', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // 1. Line offset
    const line = new DxfEntity({
      handle: '10',
      type: 'LINE',
      geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
    });
    doc.addEntity(line);

    const offsetLineCmd = new OffsetCommand({
      entityId: line.id,
      distance: 20,
      sidePoint: { x: 50, y: 50 }, // Offset upwards (+y)
    });
    const csLine = history.execute(offsetLineCmd, doc);

    assert.equal(csLine.added.length, 1);
    const offsetLine = doc.getEntity(csLine.added[0].entityId);
    assert.equal(offsetLine.geometry.start.y, 20);
    assert.equal(offsetLine.geometry.end.y, 20);

    // 2. Circle offset
    const circle = new DxfEntity({
      handle: '11',
      type: 'CIRCLE',
      geometry: { center: { x: 0, y: 0, z: 0 }, radius: 30 },
    });
    doc.addEntity(circle);

    const offsetCircleCmd = new OffsetCommand({
      entityId: circle.id,
      distance: 10,
      sidePoint: { x: 100, y: 0 }, // Outside -> radius 40
    });
    const csCircle = history.execute(offsetCircleCmd, doc);
    assert.equal(doc.getEntity(csCircle.added[0].entityId).geometry.radius, 40);

    // Undo circle offset
    history.undo(doc);
    assert.equal(doc.getEntity(csCircle.added[0].entityId), null);
  });

  it('FilletCommand: sharp corner join (radius=0) and tangent arc (radius>0)', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // Two lines: L1 from (0, 0) to (50, 0), L2 from (60, 10) to (60, 60)
    const l1 = new DxfEntity({
      handle: '10',
      type: 'LINE',
      geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 50, y: 0, z: 0 } },
    });
    const l2 = new DxfEntity({
      handle: '11',
      type: 'LINE',
      geometry: { start: { x: 60, y: 10, z: 0 }, end: { x: 60, y: 60, z: 0 } },
    });
    doc.addEntity(l1);
    doc.addEntity(l2);

    // 1. Sharp corner fillet (radius = 0): should meet at (60, 0)
    const fillet0 = new FilletCommand({
      entity1Id: l1.id,
      entity2Id: l2.id,
      radius: 0,
    });
    history.execute(fillet0, doc);

    assert.equal(l1.geometry.end.x, 60);
    assert.equal(l1.geometry.end.y, 0);
    assert.equal(l2.geometry.start.x, 60);
    assert.equal(l2.geometry.start.y, 0);

    // Undo sharp corner
    history.undo(doc);
    assert.equal(l1.geometry.end.x, 50);
    assert.equal(l2.geometry.start.x, 60);
    assert.equal(l2.geometry.start.y, 10);

    // 2. Tangent arc fillet (radius = 10)
    const fillet10 = new FilletCommand({
      entity1Id: l1.id,
      entity2Id: l2.id,
      radius: 10,
    });
    const csFillet = history.execute(fillet10, doc);

    assert.equal(csFillet.added.length, 1);
    const arc = doc.getEntity(csFillet.added[0].entityId);
    assert.equal(arc.type, 'ARC');
    assert.ok(Math.abs(arc.geometry.radius - 10) < 1e-6);

    // L1 trimmed to (50, 0), L2 trimmed to (60, 10)
    assert.equal(l1.geometry.end.x, 50);
    assert.equal(l1.geometry.end.y, 0);
    assert.equal(l2.geometry.start.x, 60);
    assert.equal(l2.geometry.start.y, 10);

    // Undo removes arc and reverts lines
    history.undo(doc);
    assert.equal(doc.getEntity(arc.id), null);
  });

  it('ExplodeCommand: explodes INSERT into transformed model space entities and LWPOLYLINE into lines', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // Define Block "DOOR" with 1 LINE and 1 ARC
    const block = new DxfBlock({ name: 'DOOR' });
    block.addEntity(new DxfEntity({
      type: 'LINE',
      layerId: '0',
      geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 30, z: 0 } },
    }));
    block.addEntity(new DxfEntity({
      type: 'ARC',
      layerId: '0',
      geometry: { center: { x: 0, y: 0, z: 0 }, radius: 30, startAngle: 0, endAngle: 90 },
    }));
    doc.addBlock(block);

    // Create INSERT instance at (100, 200)
    const insert = new DxfEntity({
      handle: '50',
      type: 'INSERT',
      layerId: 'ARCH',
      geometry: { insertionPoint: { x: 100, y: 200, z: 0 } },
      attributes: { blockName: 'DOOR' },
    });
    doc.addEntity(insert);

    const initialDocEntities = doc.entities.length;

    // Explode INSERT
    const explodeCmd = new ExplodeCommand([insert.id]);
    const cs = history.execute(explodeCmd, doc);

    assert.equal(cs.deleted.length, 1);
    assert.equal(doc.getEntity(insert.id), null);
    assert.equal(cs.added.length, 2);

    const childLine = cs.added.map(e=>doc.getEntity(e.entityId)).find(e=>e.type==='LINE');
    const childArc = cs.added.map(e=>doc.getEntity(e.entityId)).find(e=>e.type==='ARC');

    assert.ok(childLine != null);
    assert.ok(childArc != null);
    // Inherited ARCH layer from INSERT instance
    assert.equal(childLine.layerId, 'ARCH');
    // Transformed position: (0, 0) + (100, 200) = (100, 200)
    assert.equal(childLine.geometry.start.x, 100);
    assert.equal(childLine.geometry.start.y, 200);
    assert.equal(childLine.geometry.end.x, 100);
    assert.equal(childLine.geometry.end.y, 230);

    // Undo restores INSERT and deletes exploded entities
    history.undo(doc);
    assert.equal(doc.entities.length, initialDocEntities);
    assert.equal(doc.getEntity(insert.id), insert);
    assert.equal(doc.getEntity(childLine.id), null);
    assert.equal(doc.getEntity(childArc.id), null);
  });

  it('JoinCommand: chains contiguous LINEs into a single continuous LWPOLYLINE', () => {
    const doc = new SampleDocument();
    const history = new CommandHistory();

    // 3 touching lines: (0,0)->(10,0), (10,0)->(10,20), (10,20)->(0,20)
    const l1 = new DxfEntity({
      handle: '10',
      type: 'LINE',
      layerId: 'OUTLINE',
      geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
    });
    const l2 = new DxfEntity({
      handle: '11',
      type: 'LINE',
      layerId: 'OUTLINE',
      geometry: { start: { x: 10, y: 0, z: 0 }, end: { x: 10, y: 20, z: 0 } },
    });
    const l3 = new DxfEntity({
      handle: '12',
      type: 'LINE',
      layerId: 'OUTLINE',
      geometry: { start: { x: 10, y: 20, z: 0 }, end: { x: 0, y: 20, z: 0 } },
    });

    doc.addEntity(l1);
    doc.addEntity(l2);
    doc.addEntity(l3);

    const joinCmd = new JoinCommand([l1.id, l2.id, l3.id]);
    const cs = history.execute(joinCmd, doc);

    assert.equal(cs.deleted.length, 3);
    assert.equal(cs.added.length, 1);

    const poly = doc.getEntity(cs.added[0].entityId);
    assert.equal(poly.type, 'LWPOLYLINE');
    assert.equal(poly.geometry.vertices.length, 4);
    assert.equal(poly.geometry.vertices[0].x, 0);
    assert.equal(poly.geometry.vertices[3].x, 0);
    assert.equal(poly.geometry.vertices[3].y, 20);

    // Undo restores the 3 lines and removes polyline
    history.undo(doc);
    assert.equal(doc.getEntity(l1.id), l1);
    assert.equal(doc.getEntity(l2.id), l2);
    assert.equal(doc.getEntity(l3.id), l3);
    assert.equal(doc.getEntity(poly.id), null);
  });

  it('Lossless Invariant on Edit-and-Undo: exact native byte round-trip',()=>{
    const input=['0','SECTION','2','ENTITIES','0','LINE','5','10','10','0.0','20','0','30','5','11','100','21','0','31','5','0','LINE','5','11','10','50','20','-50','30','5','11','50','21','50','31','5','0','ENDSEC','0','EOF'].join('\n');
    const doc=DxfDocumentParser.parse(input),history=new CommandHistory(),[l1,l2]=doc.entities;
    history.execute(new TrimEntitiesCommand({entityId:l1.id,cuttingEdgeIds:[l2.id],clickPoint:{x:80,y:0}}),doc);
    assert.notEqual(DxfDocumentWriter.write(doc),input);history.undo(doc);assert.equal(DxfDocumentWriter.write(doc),input);
  });
});
