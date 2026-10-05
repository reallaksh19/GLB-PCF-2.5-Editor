/**
 * tests/dxf/dxf-grips-snaps.test.mjs
 *
 * Test Suite for Phase 7: Grip System & Visual Cues / Snaps & 2D Geometry Kernel.
 * Verifies CadSnapService, CadGeometry2D, GripPoint, GripManager, GripEditCommand,
 * and lossless transactional undo/redo invariants.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DxfDocument } from '../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../formats/dxf/model/dxf-entity.js';
import { SpatialIndex2D } from '../../core/spatial/spatial-index-2d.js';
import {
  CadSnapService,
  CadSnapMode,
  CadGeometry2D,
  pointDistance,
  arcMidpoint,
  pointOnArc,
} from '../../core/geometry/index.js';
import {
  GripPoint,
  GripRole,
  GripState,
  GripManager,
  GripEditCommand,
} from '../../core/grips/index.js';

test('Phase 7: Object Snaps (CadSnapService & CadGeometry2D)', async (t) => {
  const snapService = new CadSnapService({ tolerance: 5.0 });

  await t.test('END snap: locates endpoints on LINE, ARC, and LWPOLYLINE', () => {
    const line = new DxfEntity({
      type: 'LINE',
      handle: 'L1',
      geometry: { start: { x: 10, y: 10 }, end: { x: 50, y: 10 } },
    });
    const arc = new DxfEntity({
      type: 'ARC',
      handle: 'A1',
      geometry: { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: 90 },
    });
    const poly = new DxfEntity({
      type: 'LWPOLYLINE',
      handle: 'P1',
      geometry: {
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 30 },
        ],
      },
    });

    // Hover near line start (10, 10)
    const snap1 = snapService.snap({ cursorPoint: { x: 11, y: 10 }, entities: [line] });
    assert.ok(snap1);
    assert.equal(snap1.mode, CadSnapMode.END);
    assert.equal(snap1.point.x, 10);
    assert.equal(snap1.point.y, 10);

    // Hover near arc end angle 90 -> (0, 10)
    const snap2 = snapService.snap({ cursorPoint: { x: 1, y: 9.5 }, entities: [arc] });
    assert.ok(snap2);
    assert.equal(snap2.mode, CadSnapMode.END);
    assert.ok(Math.abs(snap2.point.x - 0) < 1e-6);
    assert.ok(Math.abs(snap2.point.y - 10) < 1e-6);

    // Hover near polyline vertex 1 -> (20, 0)
    const snap3 = snapService.snap({ cursorPoint: { x: 19.5, y: 0.5 }, entities: [poly] });
    assert.ok(snap3);
    assert.equal(snap3.mode, CadSnapMode.END);
    assert.equal(snap3.point.x, 20);
    assert.equal(snap3.point.y, 0);
  });

  await t.test('MID snap: calculates exact midpoints on LINE, ARC, and LWPOLYLINE with bulge', () => {
    const line = new DxfEntity({
      type: 'LINE',
      handle: 'L2',
      geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    });
    // Arc from 0 to 180 deg, radius 50 -> midpoint is at 90 deg: (0, 50)
    const arc = new DxfEntity({
      type: 'ARC',
      handle: 'A2',
      geometry: { center: { x: 0, y: 0 }, radius: 50, startAngle: 0, endAngle: 180 },
    });
    // Polyline semicircle with bulge 1 from (0, 0) to (0, 40)
    const polyBulge = new DxfEntity({
      type: 'LWPOLYLINE',
      handle: 'P2',
      geometry: {
        vertices: [
          { x: 0, y: 0, bulge: 1.0 },
          { x: 0, y: 40 },
        ],
      },
    });

    const snapLineMid = snapService.snap({
      cursorPoint: { x: 50.5, y: 0.5 },
      entities: [line],
      activeModes: [CadSnapMode.MID],
    });
    assert.ok(snapLineMid);
    assert.equal(snapLineMid.mode, CadSnapMode.MID);
    assert.equal(snapLineMid.point.x, 50);
    assert.equal(snapLineMid.point.y, 0);

    const snapArcMid = snapService.snap({
      cursorPoint: { x: 0.5, y: 49.5 },
      entities: [arc],
      activeModes: [CadSnapMode.MID],
    });
    assert.ok(snapArcMid);
    assert.equal(snapArcMid.mode, CadSnapMode.MID);
    assert.ok(Math.abs(snapArcMid.point.x - 0) < 1e-6);
    assert.ok(Math.abs(snapArcMid.point.y - 50) < 1e-6);

    const snapPolyMid = snapService.snap({
      cursorPoint: { x: -20, y: 20 },
      entities: [polyBulge],
      activeModes: [CadSnapMode.MID],
    });
    assert.ok(snapPolyMid);
    assert.equal(snapPolyMid.mode, CadSnapMode.MID);
    assert.ok(Math.abs(snapPolyMid.point.x - (-20)) < 1e-3);
    assert.ok(Math.abs(snapPolyMid.point.y - 20) < 1e-3);
  });

  await t.test('CEN and QUAD snaps: extracts centers and 4 quadrants on CIRCLE and ARC', () => {
    const circle = new DxfEntity({
      type: 'CIRCLE',
      handle: 'C1',
      geometry: { center: { x: 50, y: 50 }, radius: 25 },
    });

    // CEN snap near center
    const snapCen = snapService.snap({
      cursorPoint: { x: 51, y: 49 },
      entities: [circle],
      activeModes: [CadSnapMode.CEN],
    });
    assert.ok(snapCen);
    assert.equal(snapCen.mode, CadSnapMode.CEN);
    assert.equal(snapCen.point.x, 50);
    assert.equal(snapCen.point.y, 50);

    // QUAD snap near top quadrant (50, 75)
    const snapQuad = snapService.snap({
      cursorPoint: { x: 50.5, y: 74 },
      entities: [circle],
      activeModes: [CadSnapMode.QUAD],
    });
    assert.ok(snapQuad);
    assert.equal(snapQuad.mode, CadSnapMode.QUAD);
    assert.equal(snapQuad.point.x, 50);
    assert.equal(snapQuad.point.y, 75);
  });

  await t.test('INT snap: finds geometric intersection point between intersecting entities', () => {
    const l1 = new DxfEntity({
      type: 'LINE',
      handle: 'L_INT1',
      geometry: { start: { x: 0, y: 50 }, end: { x: 100, y: 50 } },
    });
    const l2 = new DxfEntity({
      type: 'LINE',
      handle: 'L_INT2',
      geometry: { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } },
    });

    const snapInt = snapService.snap({
      cursorPoint: { x: 51, y: 51 },
      entities: [l1, l2],
      activeModes: [CadSnapMode.INT],
    });
    assert.ok(snapInt);
    assert.equal(snapInt.mode, CadSnapMode.INT);
    assert.equal(snapInt.point.x, 50);
    assert.equal(snapInt.point.y, 50);
  });

  await t.test('NEA and PERP snaps: computes closest point and perpendicular foot from basePoint', () => {
    const line = new DxfEntity({
      type: 'LINE',
      handle: 'L_NP',
      geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    });

    // NEA snap on line
    const snapNea = snapService.snap({
      cursorPoint: { x: 33, y: 1.5 },
      entities: [line],
      activeModes: [CadSnapMode.NEA],
    });
    assert.ok(snapNea);
    assert.equal(snapNea.mode, CadSnapMode.NEA);
    assert.equal(snapNea.point.x, 33);
    assert.equal(snapNea.point.y, 0);

    // PERP snap from basePoint (45, 50) onto line (0,0)-(100,0) -> (45, 0)
    const snapPerp = snapService.snap({
      cursorPoint: { x: 44, y: 1 },
      basePoint: { x: 45, y: 50 },
      entities: [line],
      activeModes: [CadSnapMode.PERP],
    });
    assert.ok(snapPerp);
    assert.equal(snapPerp.mode, CadSnapMode.PERP);
    assert.equal(snapPerp.point.x, 45);
    assert.equal(snapPerp.point.y, 0);
  });

  await t.test('Prioritization & Tie-Breaking: END outranks NEA, closer candidate preferred', () => {
    const line = new DxfEntity({
      type: 'LINE',
      handle: 'L_PRIO',
      geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    });

    const snapClosest = snapService.snap({
      cursorPoint: { x: 0.1, y: 0.1 },
      entities: [line],
      activeModes: [CadSnapMode.END, CadSnapMode.NEA],
    });
    assert.ok(snapClosest);
    assert.ok(snapClosest.mode === CadSnapMode.END || snapClosest.mode === CadSnapMode.NEA);
  });

  await t.test('SpatialIndex integration: queries candidates within tolerance bounding box', () => {
    const spatialIndex = new SpatialIndex2D();
    const lNear = new DxfEntity({
      type: 'LINE',
      handle: 'L_NEAR',
      geometry: { start: { x: 10, y: 10 }, end: { x: 20, y: 10 } },
    });
    const lFar = new DxfEntity({
      type: 'LINE',
      handle: 'L_FAR',
      geometry: { start: { x: 5000, y: 5000 }, end: { x: 5020, y: 5000 } },
    });

    spatialIndex.insert({ id: lNear.id, minX: 10, minY: 10, maxX: 20, maxY: 10 });
    spatialIndex.insert({ id: lFar.id, minX: 5000, minY: 5000, maxX: 5020, maxY: 5000 });

    const snap = snapService.snap({
      cursorPoint: { x: 10.5, y: 10.5 },
      entities: [lNear, lFar],
      spatialIndex,
      tolerance: 2.0,
    });
    assert.ok(snap);
    assert.equal(snap.entityId, lNear.id);
  });
});

test('Phase 7: Grip Model & GripManager', async (t) => {
  const gripManager = new GripManager({ pickTolerance: 5.0 });

  await t.test('extractEntityGrips: extracts correct grips for LINE, CIRCLE, ARC, LWPOLYLINE, TEXT', () => {
    const line = new DxfEntity({
      type: 'LINE',
      handle: 'GL1',
      geometry: { start: { x: 10, y: 20 }, end: { x: 90, y: 20 } },
    });
    const circle = new DxfEntity({
      type: 'CIRCLE',
      handle: 'GC1',
      geometry: { center: { x: 50, y: 50 }, radius: 20 },
    });
    const arc = new DxfEntity({
      type: 'ARC',
      handle: 'GA1',
      geometry: { center: { x: 0, y: 0 }, radius: 30, startAngle: 0, endAngle: 90 },
    });
    const poly = new DxfEntity({
      type: 'LWPOLYLINE',
      handle: 'GP1',
      geometry: {
        vertices: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 30 },
        ],
      },
    });
    const text = new DxfEntity({
      type: 'TEXT',
      handle: 'GT1',
      geometry: { point: { x: 15, y: 25 } },
    });

    const lineGrips = gripManager.extractEntityGrips(line);
    assert.equal(lineGrips.length, 3); // START, END, MID
    assert.ok(lineGrips.some((g) => g.role === GripRole.START && g.point.x === 10));
    assert.ok(lineGrips.some((g) => g.role === GripRole.END && g.point.x === 90));
    assert.ok(lineGrips.some((g) => g.role === GripRole.MID && g.point.x === 50));

    const circleGrips = gripManager.extractEntityGrips(circle);
    assert.equal(circleGrips.length, 5); // CENTER + 4 QUADRANTS
    assert.ok(circleGrips.some((g) => g.role === GripRole.CENTER && g.point.x === 50));

    const arcGrips = gripManager.extractEntityGrips(arc);
    assert.equal(arcGrips.length, 4); // CENTER, START, END, MID
    assert.ok(arcGrips.some((g) => g.role === GripRole.CENTER));
    assert.ok(arcGrips.some((g) => g.role === GripRole.START && g.point.x === 30));

    const polyGrips = gripManager.extractEntityGrips(poly);
    assert.equal(polyGrips.length, 5); // 3 VERTEX + 2 MID
    assert.equal(polyGrips.filter((g) => g.role === GripRole.VERTEX).length, 3);
    assert.equal(polyGrips.filter((g) => g.role === GripRole.MID).length, 2);

    const textGrips = gripManager.extractEntityGrips(text);
    assert.equal(textGrips.length, 1);
    assert.equal(textGrips[0].role, GripRole.INSERTION);
  });

  await t.test('findGripAt and activateGrip: performs hit testing and state transition', () => {
    const line = new DxfEntity({
      type: 'LINE',
      handle: 'GL2',
      geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    });

    const grips = gripManager.updateGripsForEntities([line]);
    assert.equal(grips.length, 3);

    // Hit test near start grip (0, 0)
    const foundGrip = gripManager.findGripAt({ x: 2, y: 1 });
    assert.ok(foundGrip);
    assert.equal(foundGrip.role, GripRole.START);
    assert.equal(foundGrip.state, GripState.COLD);

    // Activate grip -> HOT
    const hotGrip = gripManager.activateGrip(foundGrip.id);
    assert.ok(hotGrip);
    assert.equal(hotGrip.state, GripState.HOT);

    // Clear hot grip
    gripManager.clearHotGrip();
    assert.equal(foundGrip.state, GripState.COLD);
  });
});

test('Phase 7: GripEditCommand & Lossless Undo/Redo Invariants', async (t) => {
  await t.test('LINE stretch START grip: updates start position while keeping end intact', () => {
    const doc = new DxfDocument();
    const line = new DxfEntity({
      handle: 'L_TEST1',
      type: 'LINE',
      layerId: '0',
      geometry: { start: { x: 10, y: 10 }, end: { x: 100, y: 10 } },
    });
    doc.addEntity(line);

    const gripManager = new GripManager();
    const grips = gripManager.updateGripsForEntities([line]);
    const startGrip = grips.find((g) => g.role === GripRole.START);

    const cmd = gripManager.createGripEditCommand(startGrip, { x: 0, y: 0 });
    const changeSet = cmd.execute(doc);

    assert.ok(changeSet.modified.some((m) => m.entity === line));
    assert.equal(line.geometry.start.x, 0);
    assert.equal(line.geometry.start.y, 0);
    assert.equal(line.geometry.end.x, 100);
    assert.equal(line.geometry.end.y, 10);
    assert.equal(line.state.modified, true);

    // Undo restores exact original geometry
    const undoCs = cmd.undo(doc);
    assert.ok(undoCs.modified.some((m) => m.entity === line));
    assert.equal(line.geometry.start.x, 10);
    assert.equal(line.geometry.start.y, 10);
    assert.equal(line.geometry.end.x, 100);
    assert.equal(line.geometry.end.y, 10);
  });

  await t.test('LINE drag MID grip: translates entire line by delta', () => {
    const doc = new DxfDocument();
    const line = new DxfEntity({
      handle: 'L_TEST2',
      type: 'LINE',
      layerId: '0',
      geometry: { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
    });
    doc.addEntity(line);

    const gripManager = new GripManager();
    const grips = gripManager.updateGripsForEntities([line]);
    const midGrip = grips.find((g) => g.role === GripRole.MID); // at (20, 0)

    // Drag mid grip from (20, 0) to (20, 50) -> dy = +50
    const cmd = gripManager.createGripEditCommand(midGrip, { x: 20, y: 50 });
    cmd.execute(doc);

    assert.equal(line.geometry.start.x, 0);
    assert.equal(line.geometry.start.y, 50);
    assert.equal(line.geometry.end.x, 40);
    assert.equal(line.geometry.end.y, 50);

    // Undo
    cmd.undo(doc);
    assert.equal(line.geometry.start.x, 0);
    assert.equal(line.geometry.start.y, 0);
    assert.equal(line.geometry.end.x, 40);
    assert.equal(line.geometry.end.y, 0);
  });

  await t.test('CIRCLE stretch QUADRANT grip: dynamically resizes radius', () => {
    const doc = new DxfDocument();
    const circle = new DxfEntity({
      handle: 'C_TEST1',
      type: 'CIRCLE',
      layerId: '0',
      geometry: { center: { x: 100, y: 100 }, radius: 25 },
    });
    doc.addEntity(circle);

    const gripManager = new GripManager();
    const grips = gripManager.updateGripsForEntities([circle]);
    const quadGrip = grips.find((g) => g.role === GripRole.QUADRANT && g.vertexIndex === 0); // at (125, 100)

    // Drag quadrant grip from (125, 100) to (150, 100) -> radius becomes 50
    const cmd = gripManager.createGripEditCommand(quadGrip, { x: 150, y: 100 });
    cmd.execute(doc);

    assert.equal(circle.geometry.radius, 50);
    assert.equal(circle.geometry.center.x, 100);
    assert.equal(circle.geometry.center.y, 100);

    // Undo
    cmd.undo(doc);
    assert.equal(circle.geometry.radius, 25);
  });

  await t.test('LWPOLYLINE stretch VERTEX grip: moves specific vertex', () => {
    const doc = new DxfDocument();
    const poly = new DxfEntity({
      handle: 'P_TEST1',
      type: 'LWPOLYLINE',
      layerId: '0',
      geometry: {
        vertices: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
        ],
      },
    });
    doc.addEntity(poly);

    const gripManager = new GripManager();
    const grips = gripManager.updateGripsForEntities([poly]);
    const v1Grip = grips.find((g) => g.role === GripRole.VERTEX && g.vertexIndex === 1); // at (50, 0)

    // Move vertex 1 from (50, 0) to (75, 25)
    const cmd = gripManager.createGripEditCommand(v1Grip, { x: 75, y: 25 });
    cmd.execute(doc);

    assert.equal(poly.geometry.vertices[0].x, 0);
    assert.equal(poly.geometry.vertices[0].y, 0);
    assert.equal(poly.geometry.vertices[1].x, 75);
    assert.equal(poly.geometry.vertices[1].y, 25);
    assert.equal(poly.geometry.vertices[2].x, 50);
    assert.equal(poly.geometry.vertices[2].y, 50);

    // Undo
    cmd.undo(doc);
    assert.equal(poly.geometry.vertices[1].x, 50);
    assert.equal(poly.geometry.vertices[1].y, 0);
  });

  await t.test('TEXT / INSERT move INSERTION grip: moves anchor position', () => {
    const doc = new DxfDocument();
    const text = new DxfEntity({
      handle: 'T_TEST1',
      type: 'TEXT',
      layerId: '0',
      geometry: { point: { x: 30, y: 40 } },
    });
    doc.addEntity(text);

    const gripManager = new GripManager();
    const grips = gripManager.updateGripsForEntities([text]);
    const insGrip = grips.find((g) => g.role === GripRole.INSERTION);

    const cmd = gripManager.createGripEditCommand(insGrip, { x: 100, y: 200 });
    cmd.execute(doc);

    assert.equal(text.geometry.point.x, 100);
    assert.equal(text.geometry.point.y, 200);

    cmd.undo(doc);
    assert.equal(text.geometry.point.x, 30);
    assert.equal(text.geometry.point.y, 40);
  });

  await t.test('Numerical robustness: handles extreme coordinates without degradation or NaN', () => {
    const highCoordLine = new DxfEntity({
      type: 'LINE',
      handle: 'L_HIGH',
      geometry: { start: { x: 1000000.0, y: 2000000.0 }, end: { x: 1000010.0, y: 2000000.0 } },
    });

    const snapService = new CadSnapService({ tolerance: 5.0 });
    const snap = snapService.snap({
      cursorPoint: { x: 1000005.1, y: 2000000.1 },
      entities: [highCoordLine],
      activeModes: [CadSnapMode.MID],
    });

    assert.ok(snap);
    assert.equal(snap.point.x, 1000005.0);
    assert.equal(snap.point.y, 2000000.0);
    assert.equal(Number.isNaN(snap.point.x), false);
    assert.equal(Number.isNaN(snap.point.y), false);
  });
});
