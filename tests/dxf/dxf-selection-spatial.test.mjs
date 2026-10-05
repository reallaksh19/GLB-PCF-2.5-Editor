/**
 * tests/dxf/dxf-selection-spatial.test.mjs
 *
 * Phase 4: Layer Model, Spatial Index & Selection Foundation Test Suite
 * Validates:
 * 1. DxfLayer records with layer -> entity ID indexing and layer mutations.
 * 2. Entity Bounds Service: tight AABB math for arcs (quadrants), polyline bulges, text, etc.
 * 3. SpatialIndex2D: STR bulk-loading, O(log N) point search, Window search, Crossing search.
 * 4. SelectionManager: stable sourceEntityId sets, modes (SET, ADD, REMOVE, TOGGLE).
 * 5. Selection survives render rebuild (Invariant 6).
 * 6. Clicking block child geometry selects the INSERT instance.
 * 7. CAD Selection operations: Window (contained), Crossing (intersecting), Select by Layer, Select by Type, Select All Similar, Zoom to Selection.
 * 8. Real-world 1.46MB fixture spatial indexing and performance benchmarks.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DxfDocument } from '../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../formats/dxf/model/dxf-layer.js';
import { DxfBlock } from '../../formats/dxf/model/dxf-block.js';
import { DxfDocumentParser } from '../../formats/dxf/parser/dxf-document-parser.js';
import { DxfRenderAdapter } from '../../formats/dxf/render/dxf-render-adapter.js';

import {
  computeItemBounds,
  computeArcBounds,
  combineBounds,
  boundsContains,
  boundsIntersect,
} from '../../formats/dxf/spatial/entity-bounds.js';
import { SpatialIndex2D } from '../../core/spatial/spatial-index-2d.js';
import { DxfSpatialIndex } from '../../formats/dxf/spatial/dxf-spatial-index.js';
import { SelectionManager, SELECTION_MODES } from '../../core/selection/selection-manager.js';

console.log('====================================================');
console.log(' Phase 4: Layer, Spatial Index & Selection Tests   ');
console.log('====================================================');

// -----------------------------------------------------------------------------
// Test 1: First-Class DxfLayer Records & Bidirectional Indexing
// -----------------------------------------------------------------------------
console.log('\n--- Test 1: First-Class DxfLayer & Layer Indexing ---');

const doc = new DxfDocument();
const layerPiping = new DxfLayer({ name: 'PIPING', colorIndex: 1, lineType: 'DASHED' });
const layerEq = new DxfLayer({ name: 'EQUIPMENT', colorIndex: 4 });
doc.addLayer(layerPiping);
doc.addLayer(layerEq);

assert.equal(doc.getAllLayers().length, 2);
assert.equal(doc.getLayer('piping').name, 'PIPING');
assert.equal(doc.getLayer('equipment').colorIndex, 4);

// Add entities to layer PIPING
const pipe1 = new DxfEntity({ handle: 'P1', type: 'LINE', layerId: 'PIPING' });
const pipe2 = new DxfEntity({ handle: 'P2', type: 'LINE', layerId: 'PIPING' });
const pump1 = new DxfEntity({ handle: 'EQ1', type: 'CIRCLE', layerId: 'EQUIPMENT' });
doc.addEntity(pipe1);
doc.addEntity(pipe2);
doc.addEntity(pump1);

// Verify bidirectional lookup
const pipingIds = doc.getEntityIdsOnLayer('PIPING');
assert.equal(pipingIds.size, 2);
assert.ok(pipingIds.has(pipe1.id));
assert.ok(pipingIds.has(pipe2.id));

const pipingEntities = doc.getEntitiesOnLayer('PIPING');
assert.equal(pipingEntities.length, 2);

const eqIds = doc.getEntityIdsOnLayer('EQUIPMENT');
assert.equal(eqIds.size, 1);
assert.ok(eqIds.has(pump1.id));

// Fast O(1) ID lookup
assert.equal(doc.getEntity(pipe1.id).handle, 'P1');
assert.equal(doc.getEntity('P2').handle, 'P2');

// Move entity to another layer
doc.moveEntityToLayer(pipe2.id, 'EQUIPMENT');
assert.equal(doc.getEntityIdsOnLayer('PIPING').size, 1);
assert.equal(doc.getEntityIdsOnLayer('EQUIPMENT').size, 2);
assert.ok(doc.getEntityIdsOnLayer('EQUIPMENT').has(pipe2.id));

// Layer state mutations
doc.setLayerVisibility('PIPING', false);
assert.equal(layerPiping.isVisible(), false);
doc.setLayerVisibility('PIPING', true);
assert.equal(layerPiping.isVisible(), true);

doc.setLayerFrozen('EQUIPMENT', true);
assert.equal(layerEq.frozen, true);
assert.equal(layerEq.isVisible(), false);

console.log('✅ Layer model and bidirectional indexing verified.');

// -----------------------------------------------------------------------------
// Test 2: Entity Bounds Service (Tight AABB Math)
// -----------------------------------------------------------------------------
console.log('\n--- Test 2: Entity Bounds Service (Tight AABB Math) ---');

// 2.1 LINE bounds
const lineBounds = computeItemBounds({
  type: 'LINE',
  geometry: { start: { x: 10, y: 20, z: 0 }, end: { x: 50, y: 80, z: 0 } },
});
assert.equal(lineBounds.min.x, 10);
assert.equal(lineBounds.max.x, 50);
assert.equal(lineBounds.min.y, 20);
assert.equal(lineBounds.max.y, 80);
assert.equal(lineBounds.size.x, 40);
assert.equal(lineBounds.size.y, 60);

// 2.2 CIRCLE bounds
const circleBounds = computeItemBounds({
  type: 'CIRCLE',
  geometry: { center: { x: 100, y: 100, z: 0 }, radius: 25 },
});
assert.equal(circleBounds.min.x, 75);
assert.equal(circleBounds.max.x, 125);
assert.equal(circleBounds.min.y, 75);
assert.equal(circleBounds.max.y, 125);

// 2.3 ARC tight bounds: Arc centered at (0, 0), radius 10, from 30° to 150°
// Passes through 90° (top extrema y = +10). Does NOT extend into negative Y!
const arcTight = computeArcBounds({ x: 0, y: 0, z: 0 }, 10, 30, 150);
assert.equal(Math.round(arcTight.max.y), 10, 'Top extrema (90°) must reach peak Y = 10');
assert.ok(arcTight.min.y >= 5.0 - 0.1, `Bottom of 30°-150° arc must stay positive (sin 30° = 0.5), got ${arcTight.min.y}`);
assert.ok(arcTight.min.y > 0, 'Tight arc bounds must NOT extend to circle bottom in negative Y');

// 2.4 Box containment and intersection
const boxOuter = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const boxInner = { minX: 10, minY: 10, maxX: 50, maxY: 50 };
const boxCrossing = { minX: 80, minY: 80, maxX: 120, maxY: 120 };
const boxOutside = { minX: 200, minY: 200, maxX: 250, maxY: 250 };

assert.equal(boundsContains(boxOuter, boxInner), true, 'boxInner should be contained in boxOuter');
assert.equal(boundsContains(boxOuter, boxCrossing), false, 'boxCrossing is not fully contained in boxOuter');
assert.equal(boundsIntersect(boxOuter, boxCrossing), true, 'boxCrossing intersects boxOuter');
assert.equal(boundsIntersect(boxOuter, boxOutside), false, 'boxOutside does not intersect boxOuter');

console.log('✅ Entity Bounds Service math verified (including tight arc quadrant extrema).');

// -----------------------------------------------------------------------------
// Test 3: 2D Spatial Index (STR Bulk Load, Point, Window, Crossing)
// -----------------------------------------------------------------------------
console.log('\n--- Test 3: 2D Spatial Index (STR R-Tree) ---');

const spatial = new SpatialIndex2D(4);
const testItems = [
  { id: 'item1', minX: 0, minY: 0, maxX: 10, maxY: 10 },
  { id: 'item2', minX: 20, minY: 20, maxX: 30, maxY: 30 },
  { id: 'item3', minX: 40, minY: 40, maxX: 50, maxY: 50 },
  { id: 'item4', minX: 5, minY: 5, maxX: 25, maxY: 25 },
  { id: 'item5', minX: 100, minY: 100, maxX: 110, maxY: 110 },
];
spatial.load(testItems);
assert.equal(spatial.size, 5);

// Point query: near (5, 5) with tolerance 2
const pointHits = spatial.searchPoint(5, 5, 2);
assert.ok(pointHits.length >= 1);
assert.equal(pointHits[0].id, 'item1', 'Closest item to (5, 5) should be item1');

// Window query: box [0, 0, 35, 35]
// item1 [0, 10] and item2 [20, 30] and item4 [5, 25] are fully inside!
// item3 [40, 50] and item5 [100, 110] are outside!
const winHits = spatial.searchWindow({ minX: 0, minY: 0, maxX: 35, maxY: 35 });
const winIds = new Set(winHits.map((h) => h.id));
assert.ok(winIds.has('item1'));
assert.ok(winIds.has('item2'));
assert.ok(winIds.has('item4'));
assert.ok(!winIds.has('item3'));
assert.ok(!winIds.has('item5'));

// Crossing query: box [25, 25, 45, 45]
// item2 [20..30] overlaps [25..45]
// item3 [40..50] overlaps [25..45]
// item4 [5..25] touches 25
const crossHits = spatial.searchCrossing({ minX: 25, minY: 25, maxX: 45, maxY: 45 });
const crossIds = new Set(crossHits.map((h) => h.id));
assert.ok(crossIds.has('item2'));
assert.ok(crossIds.has('item3'));
assert.ok(crossIds.has('item4'));
assert.ok(!crossIds.has('item1'));
assert.ok(!crossIds.has('item5'));

console.log('✅ 2D Spatial Index verified (STR packing, point search, Window search, Crossing search).');

// -----------------------------------------------------------------------------
// Test 4: Format-Independent SelectionManager & Block Child Selection
// -----------------------------------------------------------------------------
console.log('\n--- Test 4: SelectionManager (Modes, Block Selection, Rebuild Survival) ---');

const selMgr = new SelectionManager();
assert.equal(selMgr.isEmpty(), true);

// 4.1 Mode: SET
selMgr.select(['dxf:entity:A', 'dxf:entity:B'], SELECTION_MODES.SET);
assert.equal(selMgr.count, 2);
assert.equal(selMgr.primaryId, 'dxf:entity:B');
assert.ok(selMgr.has('dxf:entity:A'));
assert.ok(selMgr.has('dxf:entity:B'));

// 4.2 Mode: ADD (Shift/Ctrl click)
selMgr.select('dxf:entity:C', SELECTION_MODES.ADD);
assert.equal(selMgr.count, 3);
assert.ok(selMgr.has('dxf:entity:C'));
assert.equal(selMgr.primaryId, 'dxf:entity:C');

// 4.3 Mode: TOGGLE
selMgr.select('dxf:entity:A', SELECTION_MODES.TOGGLE); // removes A
assert.equal(selMgr.count, 2);
assert.ok(!selMgr.has('dxf:entity:A'));
selMgr.select('dxf:entity:A', SELECTION_MODES.TOGGLE); // adds A back
assert.equal(selMgr.count, 3);
assert.ok(selMgr.has('dxf:entity:A'));

// 4.4 Mode: REMOVE
selMgr.select(['dxf:entity:A', 'dxf:entity:C'], SELECTION_MODES.REMOVE);
assert.equal(selMgr.count, 1);
assert.ok(selMgr.has('dxf:entity:B'));

// 4.5 Block child geometry selects the INSERT instance
console.log('Subtest: Clicking block child geometry selects the INSERT instance...');
const blockTestDoc = new DxfDocument();
const valveBlk = new DxfBlock({ name: 'VALVE' });
valveBlk.addEntity(new DxfEntity({
  handle: 'VL1',
  type: 'LINE',
  geometry: { start: { x: -10, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
}));
valveBlk.addEntity(new DxfEntity({
  handle: 'VC1',
  type: 'CIRCLE',
  geometry: { center: { x: 0, y: 0, z: 0 }, radius: 5 },
}));
blockTestDoc.addBlock(valveBlk);

const insertEnt = new DxfEntity({
  handle: 'INS_VALVE_99',
  type: 'INSERT',
  layerId: 'PIPING',
  geometry: { point: { x: 50, y: 50, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  attributes: { blockName: 'VALVE' },
});
blockTestDoc.addEntity(insertEnt);

const renderModel = DxfRenderAdapter.buildRenderModel(blockTestDoc);
const dxfSpatial = new DxfSpatialIndex();
dxfSpatial.loadFromRenderModel(renderModel);

// Click directly on the valve line at (50, 50) in world space
selMgr.selectPoint(50, 50, dxfSpatial, { tolerance: 2 });
assert.equal(selMgr.count, 1);
assert.equal(
  selMgr.primaryId,
  insertEnt.id,
  'Clicking block child geometry MUST select the parent INSERT instance'
);

// 4.6 Acceptance Criterion: Selection survives render rebuild
console.log('Subtest: Selection survives render rebuild...');
const savedSelectionIds = selMgr.getIds();
assert.deepEqual(savedSelectionIds, [insertEnt.id]);

// Rebuild render model from scratch
const rebuiltModel = DxfRenderAdapter.buildRenderModel(blockTestDoc);
dxfSpatial.loadFromRenderModel(rebuiltModel);

// Selection manager state is still 100% valid!
assert.equal(selMgr.count, 1);
assert.ok(selMgr.has(insertEnt.id));

// Zoom to Selection bounds
const zoomBounds = selMgr.getSelectionBounds(dxfSpatial);
assert.ok(zoomBounds, 'Zoom to selection bounds must be computed');
assert.ok(zoomBounds.min.x <= 45 && zoomBounds.max.x >= 55);
assert.equal(Math.round(zoomBounds.center.x), 50);
assert.equal(Math.round(zoomBounds.center.y), 50);

console.log('✅ SelectionManager tests passed (modes, block child selection, rebuild survival, zoom to selection).');

// -----------------------------------------------------------------------------
// Test 5: CAD-Native Selection Actions (Window, Crossing, Layer, Type, Similar)
// -----------------------------------------------------------------------------
console.log('\n--- Test 5: CAD-Native Selection Actions ---');

const cadDoc = new DxfDocument();
cadDoc.addLayer(new DxfLayer({ name: 'PIPES', colorIndex: 1 }));
cadDoc.addLayer(new DxfLayer({ name: 'VALVES', colorIndex: 2 }));

// Pipe 1 on PIPES: (10, 10) to (30, 10) - fully inside [0, 0, 50, 50]
cadDoc.addEntity(new DxfEntity({
  handle: 'PIPE_1',
  type: 'LINE',
  layerId: 'PIPES',
  geometry: { start: { x: 10, y: 10, z: 0 }, end: { x: 30, y: 10, z: 0 } },
}));

// Pipe 2 on PIPES: (40, 10) to (80, 10) - crosses boundary at x=50
cadDoc.addEntity(new DxfEntity({
  handle: 'PIPE_2',
  type: 'LINE',
  layerId: 'PIPES',
  geometry: { start: { x: 40, y: 10, z: 0 }, end: { x: 80, y: 10, z: 0 } },
}));

// Valve 1 on VALVES: Circle center (20, 30), radius 5 - fully inside [0, 0, 50, 50]
cadDoc.addEntity(new DxfEntity({
  handle: 'VALVE_1',
  type: 'CIRCLE',
  layerId: 'VALVES',
  geometry: { center: { x: 20, y: 30, z: 0 }, radius: 5 },
}));

// Valve 2 on VALVES: Circle center (120, 120), radius 5 - far outside
cadDoc.addEntity(new DxfEntity({
  handle: 'VALVE_2',
  type: 'CIRCLE',
  layerId: 'VALVES',
  geometry: { center: { x: 120, y: 120, z: 0 }, radius: 5 },
}));

const cadSpatial = new DxfSpatialIndex();
cadSpatial.loadFromDocument(cadDoc);

const cadSel = new SelectionManager();

// 5.1 Window Selection (left-to-right drag): [0, 0, 50, 50]
// Only PIPE_1 and VALVE_1 are fully contained! PIPE_2 crosses the right edge.
cadSel.selectWindow({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, cadSpatial);
assert.equal(cadSel.count, 2, 'Window selection should only select fully contained entities');
assert.ok(cadSel.has(cadDoc.getEntity('PIPE_1').id));
assert.ok(cadSel.has(cadDoc.getEntity('VALVE_1').id));
assert.ok(!cadSel.has(cadDoc.getEntity('PIPE_2').id), 'PIPE_2 crossed the border, must not be selected by Window');

// 5.2 Crossing Selection (right-to-left drag): [0, 0, 50, 50]
// PIPE_1, VALVE_1, AND PIPE_2 (crossing) are selected!
cadSel.selectCrossing({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, cadSpatial);
assert.equal(cadSel.count, 3, 'Crossing selection must include crossing entity PIPE_2');
assert.ok(cadSel.has(cadDoc.getEntity('PIPE_1').id));
assert.ok(cadSel.has(cadDoc.getEntity('PIPE_2').id));
assert.ok(cadSel.has(cadDoc.getEntity('VALVE_1').id));

// 5.3 Select by Layer: 'VALVES'
cadSel.selectByLayer('VALVES', cadDoc);
assert.equal(cadSel.count, 2);
assert.ok(cadSel.has(cadDoc.getEntity('VALVE_1').id));
assert.ok(cadSel.has(cadDoc.getEntity('VALVE_2').id));

// 5.4 Select by Entity Type: 'LINE'
cadSel.selectByType('LINE', cadDoc);
assert.equal(cadSel.count, 2);
assert.ok(cadSel.has(cadDoc.getEntity('PIPE_1').id));
assert.ok(cadSel.has(cadDoc.getEntity('PIPE_2').id));

// 5.5 Select All Similar: based on VALVE_1 (Type = CIRCLE, Layer = VALVES)
cadSel.set(cadDoc.getEntity('VALVE_1').id);
cadSel.selectAllSimilar(cadDoc.getEntity('VALVE_1').id, cadDoc);
assert.equal(cadSel.count, 2);
assert.ok(cadSel.has(cadDoc.getEntity('VALVE_1').id));
assert.ok(cadSel.has(cadDoc.getEntity('VALVE_2').id));
assert.ok(!cadSel.has(cadDoc.getEntity('PIPE_1').id), 'Pipes should not be selected by Select All Similar for valves');

console.log('✅ CAD-Native selection actions verified (Window, Crossing, Select by Layer, Type, Similar).');

// -----------------------------------------------------------------------------
// Test 6: Real-World 1.46MB CAD Fixture Spatial Index Benchmark
// -----------------------------------------------------------------------------
console.log('\n--- Test 6: Real-World CAD Fixture Spatial Performance ---');

const largeFixturePath = path.join(
  process.cwd(),
  'Comments',
  'dxf-1',
  'STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf'
);

if (fs.existsSync(largeFixturePath)) {
  const content = fs.readFileSync(largeFixturePath, 'utf8');
  const parsedDoc = DxfDocumentParser.parse(content);
  const largeModel = DxfRenderAdapter.buildRenderModel(parsedDoc);

  const t0 = Date.now();
  const largeSpatial = new DxfSpatialIndex();
  largeSpatial.loadFromRenderModel(largeModel);
  const t1 = Date.now();

  console.log(`Large drawing spatial indexing (7,300 primitives):`);
  console.log(`- Built R-Tree index in: ${t1 - t0}ms`);
  console.log(`- Total indexed unique entities: ${largeSpatial.size}`);

  // Performance benchmark: 100 random point searches
  const tPoint0 = performance.now();
  let totalPointHits = 0;
  for (let i = 0; i < 100; i++) {
    const rx = Math.random() * 420;
    const ry = Math.random() * 297;
    const hits = largeSpatial.searchPoint(rx, ry, 5);
    totalPointHits += hits.length;
  }
  const tPoint1 = performance.now();
  const avgPointMs = (tPoint1 - tPoint0) / 100;
  console.log(`- 100 Point searches took: ${(tPoint1 - tPoint0).toFixed(2)}ms (avg ${avgPointMs.toFixed(3)}ms / query)`);
  assert.ok(avgPointMs < 1.0, `Point queries must average < 1ms, got ${avgPointMs}ms`);

  // Performance benchmark: Window query
  const tWin0 = performance.now();
  const windowResults = largeSpatial.searchWindow({ minX: 100, minY: 50, maxX: 300, maxY: 250 });
  const tWin1 = performance.now();
  console.log(`- Window query found ${windowResults.length} entities in ${(tWin1 - tWin0).toFixed(2)}ms`);
  assert.ok((tWin1 - tWin0) < 10, 'Window query must complete in < 10ms without full-scene scan');

  // Performance benchmark: Crossing query
  const tCross0 = performance.now();
  const crossingResults = largeSpatial.searchCrossing({ minX: 100, minY: 50, maxX: 300, maxY: 250 });
  const tCross1 = performance.now();
  console.log(`- Crossing query found ${crossingResults.length} entities in ${(tCross1 - tCross0).toFixed(2)}ms`);
  assert.ok(crossingResults.length >= windowResults.length, 'Crossing query must return >= Window query items');

  // Verify SelectionManager on large drawing
  const largeSel = new SelectionManager();
  largeSel.select(windowResults, SELECTION_MODES.SET);
  assert.equal(largeSel.count, windowResults.length);

  const selBounds = largeSel.getSelectionBounds(largeSpatial);
  assert.ok(selBounds && selBounds.size.x > 0);
  console.log(`- Zoom to selection bounds for ${largeSel.count} items: [${Math.round(selBounds.size.x)} x ${Math.round(selBounds.size.y)}]`);

  console.log('✅ Real-world CAD spatial performance verified.');
} else {
  console.log('⚠️ Large fixture not found, skipping fixture 6.');
}

console.log('\n====================================================');
console.log('✅ All Phase 4 Layer & Selection tests passed!      ');
console.log('====================================================');
