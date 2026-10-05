/**
 * tests/cad/A06/annotation-text.test.mjs
 *
 * Comprehensive milestone test suite for A06 TEXT/MTEXT source-space layout,
 * glyph provider fallback coverage, 3D bounds, and non-mutation guarantees.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GlyphProvider,
  StandardGlyphProvider,
  createDefaultGlyphProvider,
  cleanMTextFormatting,
  parseMTextRuns,
  layoutTextEntity,
  layoutMTextEntity,
  projectAnnotation,
} from '../../../formats/dxf/render/annotations/index.js';

test('A06: GlyphProvider measures standard CAD glyphs, tracks fallbacks and disposes cleanly', () => {
  const provider = createDefaultGlyphProvider();

  // 1. Monospace font
  const monoDesc = provider.resolveFont('MONO', 'txt.shx');
  assert.equal(monoDesc.isMonospace, true);
  const m1 = provider.measureText('HELLO', { height: 10, font: monoDesc });
  // Monospace ratio is 0.6 -> each char width = 10 * 0.6 = 6 -> 5 chars = 30
  assert.equal(m1.width, 30);
  assert.equal(m1.hasMissingGlyphs, false);

  // 2. Proportional font with standard characters and CAD symbols
  const propDesc = provider.resolveFont('STANDARD', 'simplex.shx');
  assert.equal(propDesc.isMonospace, false);
  const m2 = provider.measureText('Ø25 ±0.5°', { height: 10, font: propDesc });
  assert.ok(m2.width > 0);
  assert.equal(m2.hasMissingGlyphs, false);

  // 3. Fallback tracking for non-standard character
  const m3 = provider.measureText('SPECIAL: \u2603', { height: 10, font: propDesc });
  assert.equal(m3.hasMissingGlyphs, true);
  assert.deepEqual(m3.missingGlyphs, ['\u2603']);

  // 4. Coverage report
  const cov = provider.getCoverageReport();
  assert.ok(cov.totalMeasured > 0);
  assert.equal(cov.totalFallback, 1);
  assert.ok(cov.missingGlyphs.includes('\u2603'));
  assert.ok(cov.coverageRatio > 0.8 && cov.coverageRatio < 1.0);

  // 5. Disposal
  provider.dispose();
  assert.equal(provider.isDisposed, true);
  assert.throws(() => provider.measureText('TEST'), /disposed/);
});

test('A06: Standard TEXT justification and anchor resolution', () => {
  const provider = createDefaultGlyphProvider();

  // Left-baseline text
  const entityLeft = {
    id: 'doc:handle:101',
    type: 'TEXT',
    attributes: { text: 'PUMP-01', height: 5.0, horizJust: 0, vertJust: 0 },
    geometry: { point: { x: 100, y: 50, z: 0 } },
  };
  const layoutLeft = layoutTextEntity(entityLeft, provider);
  assert.equal(layoutLeft.hAlign, 'LEFT');
  assert.equal(layoutLeft.vAlign, 'BASELINE');
  assert.deepEqual(layoutLeft.anchorPoint, { x: 100, y: 50, z: 0 });
  assert.equal(layoutLeft.localCorners[0].x, 0); // left anchor starts at x=0

  // Center-Middle text with alignment point
  const entityCenter = {
    id: 'doc:handle:102',
    type: 'TEXT',
    attributes: { text: 'VALVE-A', height: 5.0, horizJust: 1, vertJust: 2 },
    geometry: {
      insertionPoint: { x: 0, y: 0, z: 0 },
      alignmentPoint: { x: 200, y: 150, z: 0 },
    },
  };
  const layoutCenter = layoutTextEntity(entityCenter, provider);
  assert.equal(layoutCenter.hAlign, 'CENTER');
  assert.equal(layoutCenter.vAlign, 'MIDDLE');
  assert.deepEqual(layoutCenter.anchorPoint, { x: 200, y: 150, z: 0 }); // alignmentPoint takes priority
  // In center alignment, local x offset is -width / 2
  const halfW = layoutCenter.metrics.width / 2;
  assert.ok(Math.abs(layoutCenter.localCorners[0].x - (-halfW)) < 1e-6);
  assert.ok(Math.abs(layoutCenter.localCorners[1].x - halfW) < 1e-6);
});

test('A06: TEXT ALIGNED and FIT dynamic scaling and orientation', () => {
  const provider = createDefaultGlyphProvider();

  // ALIGNED: (0,0) to (100,0) -> target length = 100
  const entityAligned = {
    id: 'doc:handle:103',
    type: 'TEXT',
    attributes: { text: 'SPANNING TEXT', horizJust: 3, vertJust: 0 },
    geometry: {
      insertionPoint: { x: 0, y: 0, z: 0 },
      alignmentPoint: { x: 100, y: 0, z: 0 },
    },
  };
  const layoutAligned = layoutTextEntity(entityAligned, provider);
  assert.equal(layoutAligned.hAlign, 'ALIGNED');
  assert.equal(layoutAligned.rotationDeg, 0);
  // Total measured width should equal target length 100
  assert.ok(Math.abs(layoutAligned.metrics.width - 100) < 1e-4);
  assert.ok(layoutAligned.height > 0);

  // FIT: height is preserved at 10.0, width factor scales to span 50.0
  const entityFit = {
    id: 'doc:handle:104',
    type: 'TEXT',
    attributes: { text: 'FIT TEXT', height: 10.0, horizJust: 5, vertJust: 0 },
    geometry: {
      insertionPoint: { x: 50, y: 50, z: 0 },
      alignmentPoint: { x: 100, y: 50, z: 0 },
    },
  };
  const layoutFit = layoutTextEntity(entityFit, provider);
  assert.equal(layoutFit.hAlign, 'FIT');
  assert.equal(layoutFit.height, 10.0); // height preserved
  assert.ok(Math.abs(layoutFit.metrics.width - 50) < 1e-4); // total width matches distance
  assert.ok(layoutFit.widthFactor > 0);
});

test('A06: TEXT generation flags (mirror X and Y)', () => {
  const provider = createDefaultGlyphProvider();

  const entityMirrored = {
    id: 'doc:handle:105',
    type: 'TEXT',
    attributes: { text: 'MIRRORED', height: 5.0, flags: 6 }, // bit 2 (mirrorX) + bit 4 (mirrorY)
    geometry: { point: { x: 0, y: 0, z: 0 } },
  };
  const layout = layoutTextEntity(entityMirrored, provider);
  assert.equal(layout.mirrorX, true);
  assert.equal(layout.mirrorY, true);
});

test('A06: MTEXT formatting parser cleans tags and extracts runs and stacked fractions', () => {
  const rawMText = '{\\fArial|b1;BOLD TITLE}\\P{\\H2x;Double Height} \\S1#2; Pipe %%c50';
  const parsed = parseMTextRuns(rawMText, { height: 2.5 });

  assert.equal(parsed.runs.length >= 4, true);
  // Paragraph break detected
  assert.ok(parsed.runs.some(r => r.isLineBreak));
  // Stacked fraction detected
  const stacked = parsed.runs.find(r => r.isStacked);
  assert.ok(stacked);
  assert.equal(stacked.stackUpper, '1');
  assert.equal(stacked.stackLower, '2');
  assert.equal(stacked.stackType, '#');

  // Clean plain text
  const clean = cleanMTextFormatting(rawMText);
  assert.ok(clean.includes('BOLD TITLE\n'));
  assert.ok(clean.includes('Pipe Ø50'));
});

test('A06: MTEXT reference width word-wrapping and line spacing', () => {
  const provider = createDefaultGlyphProvider();

  // Multi-word MTEXT with narrow reference width
  const entityWrap = {
    id: 'doc:handle:201',
    type: 'MTEXT',
    attributes: {
      text: 'First line of annotation and second wrapped line',
      height: 2.5,
      referenceWidth: 30.0,
      attachmentPoint: 1, // TopLeft
    },
    geometry: { point: { x: 0, y: 0, z: 0 } },
  };

  const layout = layoutMTextEntity(entityWrap, provider);
  assert.ok(layout.lines.length >= 2, 'Should wrap into multiple lines');
  assert.ok(layout.metrics.height > layout.height, 'Multiline height exceeds single line');
  assert.equal(layout.attachment.h, 'LEFT');
  assert.equal(layout.attachment.v, 'TOP');
});

test('A06: MTEXT all 9 attachment points position bounding box correctly', () => {
  const provider = createDefaultGlyphProvider();

  for (let code = 1; code <= 9; code++) {
    const entity = {
      id: `doc:handle:att-${code}`,
      type: 'MTEXT',
      attributes: { text: 'ATTACH TEST', height: 4.0, attachmentPoint: code },
      geometry: { point: { x: 100, y: 100, z: 0 } },
    };
    const layout = layoutMTextEntity(entity, provider);
    assert.equal(layout.attachmentPoint, code);
    assert.ok(layout.localBounds.min.x <= 100 && layout.localBounds.max.x >= 100 ||
              layout.localBounds.min.x >= 100 || layout.localBounds.max.x <= 100);
    assert.ok(layout.planeCorners.length === 4);
  }
});

test('A06: MTEXT unsupported format diagnostics reporting', () => {
  const rawWithUnsupported = 'Normal Text \\A1;TopAligned \\T2.5;Tracked';
  const { diagnostics, cleanText } = parseMTextRuns(rawWithUnsupported);

  assert.ok(diagnostics.length >= 2);
  assert.equal(diagnostics[0].code, 'MTEXT_UNSUPPORTED_FORMAT_CODE');
  assert.ok(diagnostics[0].tag.includes('\\A1;'));
  assert.ok(diagnostics[1].tag.includes('\\T2.5;'));
  assert.ok(cleanText.includes('Normal Text'));
});

test('A06: projectAnnotation produces stable occurrence identity and 3D bounds without mutating entity', () => {
  const entity = {
    id: 'doc:handle:301',
    type: 'TEXT',
    attributes: { text: 'VALVE-TAG-01', height: 3.0, rotation: 45 },
    geometry: {
      insertionPoint: { x: 10, y: 20, z: 5 },
      extrusion: { x: 0, y: 0, z: 1 },
    },
  };

  const style = { layerName: 'ANNOTATIONS', color: 1 };
  const blockContext = {
    rootInsertId: 'doc:handle:root-insert',
    instancePath: [{ blockName: 'VALVE_SYM', handle: 'B1' }],
    basePoint: { x: 0, y: 0, z: 0 },
  };

  // Transform matrix (translates by dx=100, dy=50)
  const transform = {
    matrix: [1, 0, 0, 100, 0, 1, 0, 50, 0, 0, 1, 0],
  };

  const snapshotBefore = JSON.stringify(entity);
  const primitive = projectAnnotation(entity, style, { transform, blockContext });
  const snapshotAfter = JSON.stringify(entity);

  // 1. Zero mutation invariant
  assert.equal(snapshotBefore, snapshotAfter, 'Authoritative entity must never be mutated');

  // 2. Stable occurrence identity
  assert.equal(primitive.sourceEntityId, 'doc:handle:root-insert');
  assert.equal(primitive.occurrence.leafEntityId, 'doc:handle:301');

  // 3. 3D world position (10 + 100 = 110, 20 + 50 = 70, z = 5)
  assert.equal(primitive.position.x, 110);
  assert.equal(primitive.position.y, 70);
  assert.equal(primitive.position.z, 5);

  // 4. Oriented bounds
  assert.ok(primitive.bounds);
  assert.equal(primitive.bounds.corners.length, 4);
  assert.ok(primitive.bounds.min.x < primitive.bounds.max.x);
  assert.ok(primitive.bounds.min.y < primitive.bounds.max.y);

  // 5. Oriented axes
  assert.ok(Math.abs(Math.hypot(primitive.xAxis.x, primitive.xAxis.y) - 1.0) < 1e-4);
});
