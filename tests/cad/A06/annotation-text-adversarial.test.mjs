/**
 * tests/cad/A06/annotation-text-adversarial.test.mjs
 *
 * Independent Reviewer Adversarial Acceptance Test Suite for A06 / Issue #94:
 * Source-space TEXT and MTEXT annotation layout, glyph provider, and bounds.
 *
 * Implements strict adversarial probes per Local_PR_Deliverty_v1.1:
 * - Escaped backslash and brace preservation (preventing accidental formatting triggers)
 * - Degenerate/zero-length ALIGNED and FIT vectors
 * - Non-finite and negative/zero height robustness
 * - Exhaustive 9-point MTEXT attachment positioning
 * - 3D OCS extrusion and block transform reflection
 * - Deep immutability verification
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

test('ADV-A06-01: Escaped backslashes and escaped braces in MTEXT are preserved and not consumed as formatting', () => {
  // \\P is an escaped backslash followed by 'P', meaning the user intends literal '\P', NOT a paragraph break
  const resBackslash = cleanMTextFormatting('\\\\P');
  assert.equal(resBackslash, '\\P', '\\\\P must not be converted into a newline');

  // \{ and \} are escaped literal braces, meaning they should not be stripped as formatting group delimiters
  const resBraces = cleanMTextFormatting('\\{IMPORTANT\\}');
  assert.equal(resBraces, '{IMPORTANT}', 'Escaped braces must be preserved as literal braces');

  // Verify parseMTextRuns handles \\P and \{ \} consistently
  const parsed = parseMTextRuns('\\\\P \\{ABC\\}');
  assert.ok(parsed.cleanText.includes('\\P'), 'parseMTextRuns preserved literal \\P');
  assert.ok(parsed.cleanText.includes('{ABC}'), 'parseMTextRuns preserved literal {ABC}');
});

test('ADV-A06-02: Zero-length and degenerate ALIGNED and FIT vectors remain safe and finite', () => {
  const provider = createDefaultGlyphProvider();

  // 1. ALIGNED with identical insertionPoint and alignmentPoint
  const degenAligned = {
    id: 'doc:degen:1',
    type: 'TEXT',
    attributes: { text: 'DEGEN-ALIGNED', horizJust: 3, height: 5.0 },
    geometry: {
      insertionPoint: { x: 50, y: 50, z: 0 },
      alignmentPoint: { x: 50, y: 50, z: 0 },
    },
  };
  const layoutAligned = layoutTextEntity(degenAligned, provider);
  assert.ok(Number.isFinite(layoutAligned.height), 'Height remains finite on zero-length ALIGNED');
  assert.ok(Number.isFinite(layoutAligned.widthFactor), 'Width factor remains finite');
  assert.ok(Number.isFinite(layoutAligned.metrics.width), 'Metrics width remains finite');
  assert.equal(layoutAligned.height, 5.0, 'Falls back to nominal height when target length is 0');

  // 2. FIT with identical insertionPoint and alignmentPoint
  const degenFit = {
    id: 'doc:degen:2',
    type: 'TEXT',
    attributes: { text: 'DEGEN-FIT', horizJust: 5, height: 4.0 },
    geometry: {
      insertionPoint: { x: 100, y: 100, z: 0 },
      alignmentPoint: { x: 100, y: 100, z: 0 },
    },
  };
  const layoutFit = layoutTextEntity(degenFit, provider);
  assert.ok(Number.isFinite(layoutFit.height), 'Height remains finite on zero-length FIT');
  assert.ok(Number.isFinite(layoutFit.widthFactor), 'Width factor remains finite');
  assert.equal(layoutFit.height, 4.0);
  assert.equal(layoutFit.widthFactor, 1.0);

  // 3. Empty text with ALIGNED
  const emptyAligned = {
    id: 'doc:degen:3',
    type: 'TEXT',
    attributes: { text: '', horizJust: 3, height: 3.0 },
    geometry: {
      insertionPoint: { x: 0, y: 0, z: 0 },
      alignmentPoint: { x: 10, y: 0, z: 0 },
    },
  };
  const layoutEmpty = layoutTextEntity(emptyAligned, provider);
  assert.ok(Number.isFinite(layoutEmpty.height));
  assert.equal(layoutEmpty.metrics.width, 0);
});

test('ADV-A06-03: Negative, zero, NaN, and Infinity heights fall back safely to valid finite defaults', () => {
  const provider = createDefaultGlyphProvider();

  // Test values: negative, zero, NaN, Infinity
  const testHeights = [-10, 0, NaN, Infinity, -Infinity];

  for (const h of testHeights) {
    const textEntity = {
      id: `doc:h:${h}`,
      type: 'TEXT',
      attributes: { text: 'SAFE_HEIGHT', height: h },
      geometry: { point: { x: 0, y: 0, z: 0 } },
    };
    const res = layoutTextEntity(textEntity, provider);
    assert.ok(Number.isFinite(res.height) && res.height > 0, `TEXT height for ${h} is finite positive: ${res.height}`);
    assert.ok(Number.isFinite(res.metrics.height) && res.metrics.height > 0);

    const mtextEntity = {
      id: `doc:mh:${h}`,
      type: 'MTEXT',
      attributes: { text: 'SAFE_MTEXT_HEIGHT', height: h },
      geometry: { insertionPoint: { x: 0, y: 0, z: 0 } },
    };
    const mres = layoutMTextEntity(mtextEntity, provider);
    assert.ok(Number.isFinite(mres.height) && mres.height > 0, `MTEXT height for ${h} is finite positive: ${mres.height}`);
    assert.ok(Number.isFinite(mres.metrics.height) && mres.metrics.height > 0);
  }
});

test('ADV-A06-04: Exhaustive 9-point MTEXT attachment positioning verification', () => {
  const provider = createDefaultGlyphProvider();

  // Expected attachment alignments
  const expected = {
    1: { h: 'LEFT', v: 'TOP' },
    2: { h: 'CENTER', v: 'TOP' },
    3: { h: 'RIGHT', v: 'TOP' },
    4: { h: 'LEFT', v: 'MIDDLE' },
    5: { h: 'CENTER', v: 'MIDDLE' },
    6: { h: 'RIGHT', v: 'MIDDLE' },
    7: { h: 'LEFT', v: 'BOTTOM' },
    8: { h: 'CENTER', v: 'BOTTOM' },
    9: { h: 'RIGHT', v: 'BOTTOM' },
  };

  for (let code = 1; code <= 9; code++) {
    const entity = {
      id: `doc:att:${code}`,
      type: 'MTEXT',
      attributes: { text: 'ATTACH_TEST', height: 10, attachmentPoint: code },
      geometry: { insertionPoint: { x: 0, y: 0, z: 0 } },
    };
    const layout = layoutMTextEntity(entity, provider);
    assert.equal(layout.attachmentPoint, code);
    assert.equal(layout.attachment.h, expected[code].h);
    assert.equal(layout.attachment.v, expected[code].v);

    // Verify local corner bounding box dimensions
    assert.ok(layout.localBounds && layout.localBounds.min && layout.localBounds.max);
    assert.ok(layout.localBounds.min.x <= layout.localBounds.max.x);
    assert.ok(layout.localBounds.min.y <= layout.localBounds.max.y);
    assert.ok(layout.metrics.width > 0);
    assert.ok(layout.metrics.height >= 10);
  }
});

test('ADV-A06-05: 3D OCS extrusion inversion and block occurrence projection', () => {
  const provider = createDefaultGlyphProvider();

  // TEXT with inverted extrusion (0, 0, -1)
  const entityExtruded = {
    id: 'doc:ext:1',
    type: 'TEXT',
    attributes: { text: 'MIRRORED_Z', height: 10 },
    geometry: {
      point: { x: 50, y: 50, z: 10 },
      extrusion: { x: 0, y: 0, z: -1 },
    },
  };

  const proj = projectAnnotation(entityExtruded, { layerName: 'TEXT_LAYER' }, { glyphProvider: provider });
  assert.equal(proj.type, 'annotation');
  assert.ok(proj.bounds && proj.bounds.min && proj.bounds.max);
  assert.ok(proj.bounds.min.x <= proj.bounds.max.x);
  assert.equal(proj.bounds.corners.length, 4);

  // Oriented corners should have z = -10 (inverted OCS plane)
  assert.ok(Math.abs(proj.bounds.corners[0].z - (-10)) < 1e-6);

  // Projection inside block with non-uniform scale and rotation
  const blockContext = {
    rootInsertId: 'doc:handle:root-insert',
    instancePath: [{ blockName: 'TITLE_BLOCK', handle: 'B1' }],
    basePoint: { x: 0, y: 0, z: 0 },
  };
  const transform = {
    matrix: [2, 0, 0, 100, 0, -1, 0, 200, 0, 0, 1, 0],
  };

  const projBlock = projectAnnotation(entityExtruded, { layerName: '0' }, {
    transform,
    blockContext,
    glyphProvider: provider,
  });

  assert.equal(projBlock.sourceEntityId, 'doc:handle:root-insert');
  assert.ok(projBlock.bounds && projBlock.bounds.min && projBlock.bounds.max);
});

test('ADV-A06-06: Deep non-mutation invariant under Object.freeze()', () => {
  const provider = createDefaultGlyphProvider();

  const deeplyFrozenText = Object.freeze({
    id: 'doc:freeze:text',
    type: 'TEXT',
    attributes: Object.freeze({
      text: 'FREEZE_ME',
      height: 5.0,
      widthFactor: 1.2,
      rotation: 45,
      horizJust: 2,
      vertJust: 1,
    }),
    geometry: Object.freeze({
      point: Object.freeze({ x: 10, y: 20, z: 0 }),
      alignmentPoint: Object.freeze({ x: 30, y: 40, z: 0 }),
    }),
  });

  // Must not throw mutation error on frozen object
  assert.doesNotThrow(() => {
    layoutTextEntity(deeplyFrozenText, provider);
    projectAnnotation(deeplyFrozenText, { layerName: 'FROZEN' }, { glyphProvider: provider });
  });

  const deeplyFrozenMText = Object.freeze({
    id: 'doc:freeze:mtext',
    type: 'MTEXT',
    attributes: Object.freeze({
      text: '{\\C1;RED \\P GREEN}',
      height: 3.5,
      referenceWidth: 50,
      attachmentPoint: 5,
    }),
    geometry: Object.freeze({
      insertionPoint: Object.freeze({ x: 0, y: 0, z: 0 }),
    }),
  });

  assert.doesNotThrow(() => {
    layoutMTextEntity(deeplyFrozenMText, provider);
    projectAnnotation(deeplyFrozenMText, { layerName: 'FROZEN_MTEXT' }, { glyphProvider: provider });
  });
});
