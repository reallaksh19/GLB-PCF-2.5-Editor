/**
 * tests/dxf/dxf-document-parser.test.mjs
 *
 * Phase 1 Verification Test Suite.
 * Validates:
 * 1. Exact entity identity (CIRCLE != ARC, TEXT != ANNOTATION, INSERT != BLOCK_COMPONENT).
 * 2. Unscaled source coordinates ($INSUNITS is metadata only).
 * 3. Raw tag preservation for round-trip fidelity.
 * 4. Polyline bulge preservation.
 * 5. Real-world fixture parsing integrity.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { DxfDocumentParser } from '../../formats/dxf/parser/dxf-document-parser.js';

const SYNTHETIC_DXF = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
4
9
$HANDSEED
5
1FF
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
PIPING
70
0
62
1
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
BLOCK
2
VALVE_SYM
70
0
10
0.0
20
0.0
30
0.0
0
CIRCLE
8
0
10
0.0
20
0.0
30
0.0
40
25.0
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
5
100
8
PIPING
10
10500.5
20
20500.75
30
0.0
11
11500.5
21
20500.75
31
0.0
0
CIRCLE
5
101
8
PIPING
10
10500.5
20
20500.75
30
0.0
40
150.0
0
TEXT
5
102
8
PIPING
10
10500.5
20
20500.75
30
0.0
40
50.0
1
4"-PIPE-1001
50
90.0
0
LWPOLYLINE
5
103
8
PIPING
90
2
70
0
10
100.0
20
200.0
42
0.41421356
10
300.0
20
400.0
0
INSERT
5
104
2
VALVE_SYM
8
PIPING
10
11000.0
20
20500.75
30
0.0
41
1.5
42
1.5
43
1.5
0
ENDSEC
0
EOF`;

function testSyntheticParsing() {
  console.log('--- Test 1: Synthetic DXF Parsing & Invariants ---');
  const doc = DxfDocumentParser.parse(SYNTHETIC_DXF, { fileName: 'test_synthetic.dxf' });

  // 1. Units & Header
  assert.strictEqual(doc.source.acadVersion, 'AC1015', 'Version matches');
  assert.strictEqual(doc.units.insunits, 4, '$INSUNITS=4 (mm) preserved as metadata');
  assert.strictEqual(doc.handles.handseed, '200', 'Handseed updated correctly');

  // 2. Layers
  const layer = doc.getLayer('PIPING');
  assert.ok(layer, 'Layer PIPING exists');
  assert.strictEqual(layer.colorIndex, 1, 'Layer colorIndex is 1 (red)');

  // 3. Blocks
  const block = doc.getBlock('VALVE_SYM');
  assert.ok(block, 'Block VALVE_SYM exists');
  assert.strictEqual(block.entities.length, 1, 'Block has 1 nested entity');
  assert.strictEqual(block.entities[0].type, 'CIRCLE', 'Block entity is CIRCLE');
  assert.strictEqual(block.entities[0].geometry.radius, 25.0, 'Radius unscaled');

  // 4. Entities & Entity Identity Invariants
  assert.strictEqual(doc.entities.length, 5, '5 root entities in model space');

  const [line, circle, text, lwpoly, insert] = doc.entities;

  // Invariant: Coordinates are NOT scaled by $INSUNITS
  assert.strictEqual(line.type, 'LINE');
  assert.strictEqual(line.geometry.start.x, 10500.5, 'Exact X coordinate preserved');
  assert.strictEqual(line.geometry.start.y, 20500.75, 'Exact Y coordinate preserved');
  assert.strictEqual(line.handle, '100');
  assert.ok(line.source.rawTags.length > 0, 'Raw tags preserved for LINE');

  // Invariant: CIRCLE is NOT converted to ARC
  assert.strictEqual(circle.type, 'CIRCLE', 'CIRCLE remains CIRCLE');
  assert.strictEqual(circle.geometry.radius, 150.0, 'Exact radius preserved');
  assert.strictEqual(circle.handle, '101');

  // Invariant: TEXT is NOT collapsed to generic ANNOTATION
  assert.strictEqual(text.type, 'TEXT', 'TEXT remains TEXT');
  assert.strictEqual(text.attributes.text, '4"-PIPE-1001', 'Text value preserved');
  assert.strictEqual(text.attributes.height, 50.0, 'Text height preserved');
  assert.strictEqual(text.attributes.rotation, 90.0, 'Text rotation preserved');

  // Invariant: Bulge in LWPOLYLINE is preserved
  assert.strictEqual(lwpoly.type, 'LWPOLYLINE');
  assert.strictEqual(lwpoly.geometry.vertices.length, 2);
  assert.strictEqual(lwpoly.geometry.vertices[0].bulge, 0.41421356, 'Bulge preserved exactly');

  // Invariant: INSERT is an instance reference, not exploded
  assert.strictEqual(insert.type, 'INSERT', 'INSERT remains INSERT');
  assert.strictEqual(insert.attributes.blockName, 'VALVE_SYM', 'Block reference preserved');
  assert.strictEqual(insert.geometry.scale.x, 1.5, 'Scale X preserved');

  console.log('✅ Synthetic parsing passed all invariants.');
}

function testFid07FixtureParsing() {
  console.log('\n--- Test 2: Repository Fixture (fid07-visual-fixture.dxf) ---');
  const fixturePath = path.resolve('tests/fixtures/dxf/fid07-visual-fixture.dxf');
  assert.ok(fs.existsSync(fixturePath), 'fid07-visual-fixture.dxf exists');

  const rawDxf = fs.readFileSync(fixturePath, 'utf8');
  const doc = DxfDocumentParser.parse(rawDxf, { fileName: 'fid07-visual-fixture.dxf' });

  assert.strictEqual(doc.units.insunits, 4, '$INSUNITS is 4');
  assert.strictEqual(doc.tables.layers.size, 3, 'Parsed 3 layers (0, PIPE, SYMBOL)');
  assert.ok(doc.getLayer('PIPE'), 'Layer PIPE exists');
  assert.ok(doc.getLayer('SYMBOL'), 'Layer SYMBOL exists');

  assert.strictEqual(doc.blocks.size, 1, '1 block definition (VALVE_SYM)');
  const block = doc.getBlock('VALVE_SYM');
  assert.strictEqual(block.entities.length, 3, 'Block contains 3 entities (2 lines, 1 circle)');
  assert.strictEqual(block.entities[2].type, 'CIRCLE', 'Block circle is CIRCLE');

  assert.strictEqual(doc.entities.length, 6, '6 root entities (LINE, LINE, ARC, CIRCLE, TEXT, INSERT)');
  const types = doc.entities.map((e) => e.type);
  assert.deepStrictEqual(types, ['LINE', 'LINE', 'ARC', 'CIRCLE', 'TEXT', 'INSERT']);

  const circle = doc.entities.find((e) => e.type === 'CIRCLE');
  assert.ok(circle, 'Root CIRCLE entity found');
  assert.strictEqual(circle.handle, 'C1');
  assert.strictEqual(circle.geometry.radius, 30.0);

  console.log('✅ Repository fid07 fixture parsing passed all assertions.');
}

function testRealLargeFixtureParsing() {
  console.log('\n--- Test 3: Real-World Large Fixture (STD-98-...dxf) ---');
  const fixturePath = path.resolve('Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf');
  if (!fs.existsSync(fixturePath)) {
    console.log('⚠️ Large fixture not found on disk, skipping.');
    return;
  }

  const rawDxf = fs.readFileSync(fixturePath, 'utf8');
  const startTime = Date.now();
  const doc = DxfDocumentParser.parse(rawDxf, { fileName: path.basename(fixturePath) });
  const duration = Date.now() - startTime;

  console.log(`Parsed ${rawDxf.length} bytes in ${duration}ms:`);
  console.log(`- Entities parsed: ${doc.entities.length}`);
  console.log(`- Text styles in table: ${doc.tables.textStyles.records.size}`);
  console.log(`- Line types in table: ${doc.tables.lineTypes.records.size}`);
  console.log(`- AutoCAD Version: ${doc.source.acadVersion}`);

  // Count types
  const typeCounts = {};
  for (const ent of doc.entities) {
    typeCounts[ent.type] = (typeCounts[ent.type] || 0) + 1;
  }
  console.log('Entity Type Distribution:', typeCounts);

  assert.strictEqual(doc.entities.length, 7300, 'Parsed exactly 7300 entities');
  assert.strictEqual(typeCounts['POLYLINE'], 7050, '7050 POLYLINE entities');
  assert.strictEqual(typeCounts['TEXT'], 250, '250 TEXT entities');
  assert.ok(doc.tables.lineTypes.records.size >= 14, 'Line types table parsed');
  assert.ok(doc.tables.textStyles.records.size >= 1, 'Text styles table parsed');

  console.log('✅ Real-world large fixture parsed cleanly.');
}

function main() {
  console.log('====================================================');
  console.log(' Phase 1: DxfDocumentParser Verification Test Suite ');
  console.log('====================================================');
  testSyntheticParsing();
  testFid07FixtureParsing();
  testRealLargeFixtureParsing();
  console.log('====================================================');
  console.log('✅ All Phase 1 tests passed successfully.');
  console.log('====================================================');
}

main();
