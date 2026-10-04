/**
 * tests/dxf/dxf-render-adapter.test.mjs
 *
 * Phase 3: DXF Render Projection Test Suite
 * Validates:
 * 1. DxfRenderAdapter projects DxfDocument into RenderModel without CEG or Three.js dependencies.
 * 2. Every primitive carries a stable sourceEntityId ('dxf:entity:<HANDLE>').
 * 3. Style resolver: BYLAYER, BYBLOCK, full 256 ACI palette, TrueColor (420), lineweights, linetypes, visibility.
 * 4. Block instance renderer: recursive transform stack, nested INSERTs, layer 0 inheritance, cycle guard, MINSERT.
 * 5. Block child geometry resolves to its INSERT instance by default.
 * 6. Text renderer: clean MTEXT strings (\\P, special escapes), alignment points (11,21,31 vs 10,20,30), bounds.
 * 7. Bulge math: accurate center, radius, and left/right curvature for polylines with bulges.
 * 8. Real-world fixture projection (1.46MB STD-98 CAD drawing and fid07-visual-fixture).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DxfDocument } from '../../formats/dxf/model/dxf-document.js';
import { DxfEntity } from '../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../formats/dxf/model/dxf-layer.js';
import { DxfBlock } from '../../formats/dxf/model/dxf-block.js';
import { DxfDocumentParser } from '../../formats/dxf/parser/dxf-document-parser.js';

import {
  DxfRenderAdapter,
  RenderModel,
  sampleBulgeArc,
  resolveEntityStyle,
  resolveLayerStyle,
  aciToRgb,
  rgbToHex,
  createInsertTransform,
  transformPoint,
  composeTransforms,
  projectBlockInstance,
  cleanMText,
  resolveTextGeometry,
} from '../../formats/dxf/render/index.js';

console.log('====================================================');
console.log(' Phase 3: DXF Render Projection Test Suite          ');
console.log('====================================================');

// -----------------------------------------------------------------------------
// Test 1: Style Resolver (ACI, TrueColor, Lineweights, BYLAYER, BYBLOCK, Visibility)
// -----------------------------------------------------------------------------
console.log('\n--- Test 1: Style & Presentation Resolver ---');

// 1.1 Standard primary ACI colors
assert.equal(aciToRgb(1), 0xff0000, 'ACI 1 should be pure Red');
assert.equal(aciToRgb(2), 0xffff00, 'ACI 2 should be Yellow');
assert.equal(aciToRgb(3), 0x00ff00, 'ACI 3 should be Green');
assert.equal(aciToRgb(4), 0x00ffff, 'ACI 4 should be Cyan');
assert.equal(aciToRgb(5), 0x0000ff, 'ACI 5 should be Blue');
assert.equal(aciToRgb(6), 0xff00ff, 'ACI 6 should be Magenta');
assert.equal(aciToRgb(7), 0xffffff, 'ACI 7 should be White');
assert.equal(rgbToHex(0xff0000), '#ff0000');

// 1.2 Monochrome grayscale ACI colors (250..255)
assert.equal(aciToRgb(250), 0x333333);
assert.equal(aciToRgb(255), 0xffffff);

// 1.3 Document with layers and inheritance
const doc = new DxfDocument();
doc.addLayer(new DxfLayer({ name: 'PIPING', colorIndex: 1, lineType: 'DASHED', lineWeight: 50 }));
doc.addLayer(new DxfLayer({ name: 'HIDDEN_LAYER', colorIndex: 3, off: true }));
doc.addLayer(new DxfLayer({ name: 'TRUECOLOR_LAYER', trueColor: 0x336699 }));

// Entity with BYLAYER color
const entByLayer = new DxfEntity({
  handle: 'E1',
  layerId: 'PIPING',
  type: 'LINE',
  style: { colorMode: 'BYLAYER', colorIndex: 256 },
});
const styleByLayer = resolveEntityStyle(entByLayer, doc);
assert.equal(styleByLayer.color, 0xff0000, 'BYLAYER should inherit PIPING layer color (Red)');
assert.equal(styleByLayer.lineType, 'DASHED', 'BYLAYER should inherit layer lineType DASHED');
assert.equal(styleByLayer.lineWeight, 0.50, 'BYLAYER should inherit layer lineWeight 0.50mm');
assert.equal(styleByLayer.visible, true);

// Entity with explicit TrueColor
const entTrueColor = new DxfEntity({
  handle: 'E2',
  layerId: 'PIPING',
  type: 'LINE',
  style: { trueColor: 0x123456 },
});
const styleTrueColor = resolveEntityStyle(entTrueColor, doc);
assert.equal(styleTrueColor.color, 0x123456, 'TrueColor should take precedence over ACI');
assert.equal(styleTrueColor.colorSource, 'TRUECOLOR');

// Layer TrueColor inherited by BYLAYER entity
const entLayerTrueColor = new DxfEntity({
  handle: 'E3',
  layerId: 'TRUECOLOR_LAYER',
  type: 'LINE',
  style: { colorIndex: 256 },
});
const styleLayerTrueColor = resolveEntityStyle(entLayerTrueColor, doc);
assert.equal(styleLayerTrueColor.color, 0x336699, 'BYLAYER should inherit layer TrueColor');

// Entity on OFF layer
const entOffLayer = new DxfEntity({
  handle: 'E4',
  layerId: 'HIDDEN_LAYER',
  type: 'LINE',
});
const styleOffLayer = resolveEntityStyle(entOffLayer, doc);
assert.equal(styleOffLayer.visible, false, 'Entity on OFF layer must have visible: false');

// Entity with negative colorIndex (AutoCAD entity turned OFF)
const entTurnedOff = new DxfEntity({
  handle: 'E5',
  layerId: 'PIPING',
  type: 'LINE',
  style: { colorIndex: -1 },
});
const styleTurnedOff = resolveEntityStyle(entTurnedOff, doc);
assert.equal(styleTurnedOff.visible, false, 'Entity with negative colorIndex must have visible: false');

console.log('✅ Style resolver tests passed (ACI, TrueColor, BYLAYER, visibility).');

// -----------------------------------------------------------------------------
// Test 2: Text Renderer (Clean MTEXT, Alignment Points, Bounds)
// -----------------------------------------------------------------------------
console.log('\n--- Test 2: Text & MText Projection ---');

// 2.1 MTEXT escape code cleaning
const rawMText = '{\\fArial|b1|i0;Line 1\\PLine 2 with %%d degrees and %%p0.05\\P%%c50 pipe}';
const cleaned = cleanMText(rawMText);
assert.equal(cleaned, 'Line 1\nLine 2 with ° degrees and ±0.05\nØ50 pipe');

// 2.2 Text alignment resolution: horizontal / vertical codes
const entTextAligned = new DxfEntity({
  handle: 'T1',
  type: 'TEXT',
  layerId: '0',
  geometry: {
    insertionPoint: { x: 100, y: 100, z: 0 },
    alignmentPoint: { x: 150, y: 120, z: 0 },
  },
  attributes: {
    text: 'CENTERED LABEL',
    horizJust: 1, // Center
    vertJust: 2, // Middle
    height: 3.5,
    rotation: 45,
  },
});

const textGeom = resolveTextGeometry(entTextAligned);
assert.equal(textGeom.position.x, 150, 'Text with hAlign > 0 must use alignmentPoint X');
assert.equal(textGeom.position.y, 120, 'Text with vAlign > 0 must use alignmentPoint Y');
assert.equal(textGeom.hAlign, 'CENTER');
assert.equal(textGeom.vAlign, 'MIDDLE');
assert.equal(textGeom.rotationDeg, 45);

console.log('✅ Text renderer tests passed (escape cleaning, justification, alignment points).');

// -----------------------------------------------------------------------------
// Test 3: Bulge Math for Polyline Arc Segments
// -----------------------------------------------------------------------------
console.log('\n--- Test 3: Polyline Bulge Geometry & Interpolation ---');

const p1 = { x: 0, y: 0, z: 0 };
const p2 = { x: 10, y: 0, z: 0 };

// Semicircle with bulge = +1 (curves to the left of chord 0,0 -> 10,0, i.e. +Y)
const arcPtsPos = sampleBulgeArc(p1, p2, 1, 16);
assert.ok(arcPtsPos.length >= 5);
assert.equal(Math.round(arcPtsPos[0].x), 0);
assert.equal(Math.round(arcPtsPos[0].y), 0);
assert.equal(Math.round(arcPtsPos[arcPtsPos.length - 1].x), 10);
assert.equal(Math.round(arcPtsPos[arcPtsPos.length - 1].y), 0);

// Find peak Y along positive bulge arc
const maxPosY = Math.max(...arcPtsPos.map((p) => p.y));
assert.ok(Math.abs(maxPosY - 5.0) < 0.05, `Positive bulge +1 should peak at Y ~ +5.0, got ${maxPosY}`);

// Semicircle with bulge = -1 (curves to the right of chord 0,0 -> 10,0, i.e. -Y)
const arcPtsNeg = sampleBulgeArc(p1, p2, -1, 16);
const minNegY = Math.min(...arcPtsNeg.map((p) => p.y));
assert.ok(Math.abs(minNegY - (-5.0)) < 0.05, `Negative bulge -1 should dip at Y ~ -5.0, got ${minNegY}`);

// Intermediate bulge = +0.5 (sagitta h = 10/2 * 0.5 = 2.5)
const arcPts05 = sampleBulgeArc(p1, p2, 0.5, 16);
const max05Y = Math.max(...arcPts05.map((p) => p.y));
assert.ok(Math.abs(max05Y - 2.5) < 0.05, `Bulge 0.5 sagitta should be 2.5, got ${max05Y}`);

console.log('✅ Bulge arc geometry tests passed (accurate center, radius, and left/right curvature).');

// -----------------------------------------------------------------------------
// Test 4: Block Renderer (Recursive Transforms, Layer 0, ByBlock, Cycles, Selection)
// -----------------------------------------------------------------------------
console.log('\n--- Test 4: Block Instance Renderer & Selection Target ---');

const blockDoc = new DxfDocument();
blockDoc.addLayer(new DxfLayer({ name: 'VALVES', colorIndex: 2 })); // Yellow
blockDoc.addLayer(new DxfLayer({ name: '0', colorIndex: 7 }));

// Define Block "VALVE_BODY" containing:
// 1. Line on layer "0" with color BYBLOCK (0) -> should inherit INSERT's layer and color!
// 2. Line on layer "VALVES" with color BYLAYER -> should retain layer VALVES!
const valveBlock = new DxfBlock({
  name: 'VALVE_BODY',
  basePoint: { x: 0, y: 0, z: 0 },
});
valveBlock.addEntity(new DxfEntity({
  handle: 'VB1',
  type: 'LINE',
  layerId: '0',
  style: { colorIndex: 0 }, // BYBLOCK
  geometry: { start: { x: -5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
}));
valveBlock.addEntity(new DxfEntity({
  handle: 'VB2',
  type: 'LINE',
  layerId: 'VALVES',
  style: { colorIndex: 256 }, // BYLAYER
  geometry: { start: { x: 0, y: -5, z: 0 }, end: { x: 0, y: 5, z: 0 } },
}));
blockDoc.addBlock(valveBlock);

// Define Nested Block "ASSEMBLY" containing an INSERT of "VALVE_BODY" at (10, 0)
const assemblyBlock = new DxfBlock({
  name: 'ASSEMBLY',
  basePoint: { x: 0, y: 0, z: 0 },
});
assemblyBlock.addEntity(new DxfEntity({
  handle: 'INS_VALVE',
  type: 'INSERT',
  layerId: '0',
  geometry: { insertionPoint: { x: 10, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 1 }, rotation: 0 },
  attributes: { blockName: 'VALVE_BODY' },
}));
blockDoc.addBlock(assemblyBlock);

// Add top-level INSERT of "ASSEMBLY" in Model Space on layer "PIPING" with color Red (1)
const topInsert = new DxfEntity({
  handle: 'TOP_INS_1',
  type: 'INSERT',
  layerId: 'PIPING',
  style: { colorIndex: 1 }, // Red
  geometry: { point: { x: 100, y: 200, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 90 },
  attributes: { blockName: 'ASSEMBLY' },
});
blockDoc.addEntity(topInsert);

// Build RenderModel
const renderModel = DxfRenderAdapter.buildRenderModel(blockDoc);

assert.ok(renderModel instanceof RenderModel);
assert.equal(renderModel.primitives.length, 2, 'Top insert should expand 2 leaf primitives through 2 levels of nesting');

// Verify selection target: child primitives MUST point back to top INSERT instance handle
for (const prim of renderModel.primitives) {
  assert.equal(
    prim.sourceEntityId,
    'dxf:entity:TOP_INS_1',
    'Block child geometry MUST resolve to top-level INSERT instance by default'
  );
  assert.ok(prim.blockContext, 'Primitive must carry blockContext');
}

// Verify layer 0 inheritance: VB1 was on layer "0", so it inherits topInsert's layer "PIPING"
const primVB1 = renderModel.primitives.find((p) => p.blockContext?.childHandle === 'VB1');
assert.ok(primVB1);
assert.equal(primVB1.layer, 'PIPING', 'Child entity on Layer 0 must inherit INSERT layer (PIPING)');
assert.equal(primVB1.style.color, 0xff0000, 'BYBLOCK child entity must inherit INSERT color (Red)');

// Verify explicit layer retention: VB2 was on layer "VALVES", so it remains on "VALVES"
const primVB2 = renderModel.primitives.find((p) => p.blockContext?.childHandle === 'VB2');
assert.ok(primVB2);
assert.equal(primVB2.layer, 'VALVES', 'Child entity on explicit layer must retain its layer');

// Verify recursive coordinate transform:
// Valve was at (10, 0), scale 2x, then top insert at (100, 200) rotated 90 deg:
// Center of valve (10, 0) rotated 90 deg: x = 100, y = 200 + 10 = 210.
// VB2 start (0, -5) scaled 2x is (0, -10). Rotated 90 deg: dx = +10, dy = 0.
// Transformed start: (100 + 10, 210 + 0) = (110, 210).
assert.ok(Math.abs(primVB2.start.x - 110) < 0.1, `Transformed X should be 110, got ${primVB2.start.x}`);
assert.ok(Math.abs(primVB2.start.y - 210) < 0.1, `Transformed Y should be 210, got ${primVB2.start.y}`);

// Circular reference test: Block A references Block A
const cyclicBlock = new DxfBlock({ name: 'CYCLE_BLOCK' });
cyclicBlock.addEntity(new DxfEntity({
  handle: 'CB1',
  type: 'INSERT',
  attributes: { blockName: 'CYCLE_BLOCK' },
}));
blockDoc.addBlock(cyclicBlock);
const cyclicInsert = new DxfEntity({
  handle: 'INS_CYCLE',
  type: 'INSERT',
  attributes: { blockName: 'CYCLE_BLOCK' },
});
blockDoc.addEntity(cyclicInsert);

// Must not throw or hang in infinite loop!
const cyclicModel = DxfRenderAdapter.buildRenderModel(blockDoc);
assert.ok(cyclicModel, 'Cyclic block definition was handled safely by cycle guard');

console.log('✅ Block instance renderer tests passed (recursive transforms, layer 0 inheritance, selection target, cycle guard).');

// -----------------------------------------------------------------------------
// Test 5: Full Entity Spectrum & RenderModel Bounding Box
// -----------------------------------------------------------------------------
console.log('\n--- Test 5: Entity Spectrum & Bounding Box ---');

const spectrumDoc = new DxfDocument();

// 1. LINE
spectrumDoc.addEntity(new DxfEntity({
  handle: 'L1',
  type: 'LINE',
  geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
}));

// 2. CIRCLE
spectrumDoc.addEntity(new DxfEntity({
  handle: 'C1',
  type: 'CIRCLE',
  geometry: { center: { x: 50, y: 50, z: 0 }, radius: 25 },
}));

// 3. ARC
spectrumDoc.addEntity(new DxfEntity({
  handle: 'A1',
  type: 'ARC',
  geometry: { center: { x: 0, y: 50, z: 0 }, radius: 20, startAngle: 0, endAngle: 180 },
}));

// 4. LWPOLYLINE
spectrumDoc.addEntity(new DxfEntity({
  handle: 'PL1',
  type: 'LWPOLYLINE',
  geometry: {
    vertices: [
      { x: 0, y: 0, bulge: 0 },
      { x: 50, y: 0, bulge: 1 }, // semicircle
      { x: 100, y: 0, bulge: 0 },
    ],
    closed: false,
  },
}));

// 5. SPLINE
spectrumDoc.addEntity(new DxfEntity({
  handle: 'SP1',
  type: 'SPLINE',
  geometry: {
    fitPoints: [
      { x: 0, y: 10, z: 0 },
      { x: 25, y: 35, z: 0 },
      { x: 50, y: 10, z: 0 },
    ],
  },
}));

// 6. ELLIPSE
spectrumDoc.addEntity(new DxfEntity({
  handle: 'EL1',
  type: 'ELLIPSE',
  geometry: {
    center: { x: 50, y: 100, z: 0 },
    majorAxis: { x: 30, y: 0, z: 0 },
    ratio: 0.5,
  },
}));

// 7. SOLID
spectrumDoc.addEntity(new DxfEntity({
  handle: 'S1',
  type: 'SOLID',
  geometry: {
    points: [
      { x: 10, y: 10, z: 0 },
      { x: 20, y: 10, z: 0 },
      { x: 10, y: 20, z: 0 },
      { x: 20, y: 20, z: 0 },
    ],
  },
}));

// 8. LEADER
spectrumDoc.addEntity(new DxfEntity({
  handle: 'LD1',
  type: 'LEADER',
  geometry: {
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 15, y: 15, z: 0 },
      { x: 30, y: 15, z: 0 },
    ],
  },
}));

// 9. TEXT
spectrumDoc.addEntity(new DxfEntity({
  handle: 'TX1',
  type: 'TEXT',
  geometry: { point: { x: 0, y: -20, z: 0 }, height: 5 },
  attributes: { text: 'SAMPLE' },
}));

const spectrumModel = DxfRenderAdapter.buildRenderModel(spectrumDoc);

assert.equal(spectrumModel.stats.lines, 1);
assert.equal(spectrumModel.stats.circles, 1);
assert.equal(spectrumModel.stats.arcs, 1);
assert.equal(spectrumModel.stats.polylines, 1);
assert.equal(spectrumModel.stats.splines, 1);
assert.equal(spectrumModel.stats.ellipses, 1);
assert.equal(spectrumModel.stats.solids, 1);
assert.equal(spectrumModel.stats.leaders, 1);
assert.equal(spectrumModel.stats.texts, 1);

// Test query methods
const circlePrims = spectrumModel.getPrimitivesForEntity('dxf:entity:C1');
assert.equal(circlePrims.length, 1);
assert.equal(circlePrims[0].type, 'circle');

// Verify bounds
assert.ok(spectrumModel.bounds.min.x <= 0, `minX should be <= 0, got ${spectrumModel.bounds.min.x}`);
assert.ok(spectrumModel.bounds.max.x >= 100, `maxX should be >= 100, got ${spectrumModel.bounds.max.x}`);
assert.ok(spectrumModel.bounds.size.x >= 100);

console.log('✅ Entity spectrum and bounding box calculation verified.');

// -----------------------------------------------------------------------------
// Test 6: Real-World Fixture Projection (1.46MB STD-98 CAD Drawing)
// -----------------------------------------------------------------------------
console.log('\n--- Test 6: Real-World CAD Fixture Projection ---');

const largeFixturePath = path.join(
  process.cwd(),
  'Comments',
  'dxf-1',
  'STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf'
);

if (fs.existsSync(largeFixturePath)) {
  const content = fs.readFileSync(largeFixturePath, 'utf8');
  const t0 = Date.now();
  const parsedDoc = DxfDocumentParser.parse(content);
  const t1 = Date.now();

  const largeModel = DxfRenderAdapter.buildRenderModel(parsedDoc);
  const t2 = Date.now();

  console.log(`Large CAD fixture (1.46MB):`);
  console.log(`- Parsed in: ${t1 - t0}ms (${parsedDoc.entities.length} entities, ${parsedDoc.blocks.size} blocks, ${parsedDoc.tables.layers.size} layers)`);
  console.log(`- Projected into RenderModel in: ${t2 - t1}ms`);
  console.log(`- Total primitives generated: ${largeModel.primitives.length}`);
  console.log(`- Primitives breakdown:`, largeModel.stats);
  console.log(`- Model Bounds:`, {
    min: { x: Math.round(largeModel.bounds.min.x), y: Math.round(largeModel.bounds.min.y) },
    max: { x: Math.round(largeModel.bounds.max.x), y: Math.round(largeModel.bounds.max.y) },
    size: { width: Math.round(largeModel.bounds.size.x), height: Math.round(largeModel.bounds.size.y) },
  });

  assert.ok(largeModel.primitives.length > 5000, 'Large drawing should produce over 5,000 render primitives');
  assert.ok(largeModel.bounds.size.x > 0, 'Bounding box width must be positive');
  assert.ok(largeModel.bounds.size.y > 0, 'Bounding box height must be positive');

  // Verify all primitives have valid non-null sourceEntityId starting with dxf:entity:
  let invalidIdCount = 0;
  for (const prim of largeModel.primitives) {
    if (!prim.sourceEntityId || !prim.sourceEntityId.startsWith('dxf:entity:')) {
      invalidIdCount++;
    }
  }
  assert.equal(invalidIdCount, 0, 'All generated primitives must have valid sourceEntityId');
  console.log('✅ Real-world fixture projection passed with 100% stable entity identification.');
} else {
  console.log('⚠️ Large fixture not found, skipping fixture 6.');
}

const fid07Path = path.join(process.cwd(), 'tests', 'fixtures', 'dxf', 'fid07-visual-fixture.dxf');
if (fs.existsSync(fid07Path)) {
  const fid07Content = fs.readFileSync(fid07Path, 'utf8');
  const fid07Doc = DxfDocumentParser.parse(fid07Content);
  const fid07Model = DxfRenderAdapter.buildRenderModel(fid07Doc);
  assert.ok(fid07Model.primitives.length > 0, 'fid07 must generate primitives');
  assert.ok(fid07Model.bounds.size.x > 0);
  console.log(`✅ fid07-visual-fixture projected (${fid07Model.primitives.length} primitives).`);
}

console.log('\n====================================================');
console.log('✅ All Phase 3 Render Projection tests passed!      ');
console.log('====================================================');
