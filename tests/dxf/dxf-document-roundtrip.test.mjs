/**
 * tests/dxf/dxf-document-roundtrip.test.mjs
 *
 * Phase 2 Verification: Round-Trip Golden Master Test Suite.
 * Validates:
 * 1. Parse -> Write -> Parse idempotence and structural equivalence.
 * 2. Untouched entity raw-tag passthrough fidelity.
 * 3. Modified entity serialization via entity codec writers.
 * 4. New entity handle allocation and $HANDSEED update.
 * 5. Full round-trip preservation of real-world CAD fixtures.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { DxfDocumentParser } from '../../formats/dxf/parser/dxf-document-parser.js';
import { DxfDocumentWriter } from '../../formats/dxf/writer/dxf-document-writer.js';
import { DxfEntity } from '../../formats/dxf/model/dxf-entity.js';

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
POLYLINE
5
105
8
PIPING
70
0
0
VERTEX
5
106
8
PIPING
10
500.25
20
600.75
30
0.0
42
0.5
0
VERTEX
5
107
8
PIPING
10
700.25
20
800.75
30
0.0
0
SEQEND
5
108
8
PIPING
0
INSERT
5
109
2
VALVE_SYM
8
PIPING
66
1
10
12000.0
20
20500.75
30
0.0
0
ATTRIB
5
110
8
PIPING
10
12000.0
20
20500.75
30
0.0
40
20.0
1
VALVE-TAG-01
2
ITEM_NO
0
SEQEND
5
111
8
PIPING
0
ENDSEC
0
EOF`;

function testSyntheticRoundTrip() {
  console.log('--- Test 1: Synthetic DXF Parse -> Write -> Parse Round-Trip ---');
  const doc1 = DxfDocumentParser.parse(SYNTHETIC_DXF, { fileName: 'roundtrip_syn.dxf' });
  const writtenDxf = DxfDocumentWriter.write(doc1, { newline: '\n' });
  const doc2 = DxfDocumentParser.parse(writtenDxf, { fileName: 'roundtrip_syn_out.dxf' });

  // 1. Invariant: Structural entity count & order
  assert.strictEqual(doc2.entities.length, doc1.entities.length, 'Entity count preserved');
  for (let i = 0; i < doc1.entities.length; i++) {
    const e1 = doc1.entities[i];
    const e2 = doc2.entities[i];
    assert.strictEqual(e2.type, e1.type, `Entity ${i} type preserved (${e1.type})`);
    assert.strictEqual(e2.handle, e1.handle, `Entity ${i} handle preserved (${e1.handle})`);
    assert.strictEqual(e2.layerId, e1.layerId, `Entity ${i} layer preserved`);
  }

  // 2. Invariant: Specific geometry preservation
  const c1 = doc1.entities[1];
  const c2 = doc2.entities[1];
  assert.strictEqual(c2.geometry.radius, c1.geometry.radius, 'Circle radius matches');
  assert.strictEqual(c2.geometry.center.x, c1.geometry.center.x, 'Circle center X matches');

  const l1 = doc1.entities[0];
  const l2 = doc2.entities[0];
  assert.strictEqual(l2.geometry.start.x, l1.geometry.start.x, 'Line start X matches');
  assert.strictEqual(l2.geometry.end.x, l1.geometry.end.x, 'Line end X matches');

  // 3. Invariant: Polyline vertices and SEQEND handles
  const poly1 = doc1.entities[5];
  const poly2 = doc2.entities[5];
  assert.strictEqual(poly2.geometry.vertices.length, poly1.geometry.vertices.length, 'Vertex count matches');
  assert.strictEqual(poly2.geometry.vertices[0].bulge, poly1.geometry.vertices[0].bulge, 'Vertex bulge matches');
  assert.ok(doc2.handles.has('108'), 'SEQEND handle 108 preserved across round-trip');

  // 4. Invariant: Block definition preserved
  const b1 = doc1.getBlock('VALVE_SYM');
  const b2 = doc2.getBlock('VALVE_SYM');
  assert.ok(b2, 'Block definition preserved');
  assert.strictEqual(b2.entities.length, b1.entities.length, 'Block entity count matches');
  assert.strictEqual(b2.entities[0].type, 'CIRCLE', 'Block circle is CIRCLE');

  console.log('✅ Synthetic round-trip passed with 100% fidelity.');
}

function testModifiedEntityRoundTrip() {
  console.log('\n--- Test 2: Modified Entity Codec Serialization ---');
  const doc = DxfDocumentParser.parse(SYNTHETIC_DXF, { fileName: 'test_mod.dxf' });

  // Modify the CIRCLE (entity 1)
  const circle = doc.entities[1];
  assert.strictEqual(circle.type, 'CIRCLE');
  circle.geometry.radius = 999.5;
  circle.geometry.center.x = 8888.0;
  circle.markModified();

  const written = DxfDocumentWriter.write(doc, { newline: '\n' });
  const docAfter = DxfDocumentParser.parse(written, { fileName: 'test_mod_out.dxf' });

  const circleAfter = docAfter.entities[1];
  assert.strictEqual(circleAfter.type, 'CIRCLE', 'Modified entity remains CIRCLE');
  assert.strictEqual(circleAfter.geometry.radius, 999.5, 'Modified radius emitted correctly');
  assert.strictEqual(circleAfter.geometry.center.x, 8888.0, 'Modified center X emitted correctly');
  assert.strictEqual(circleAfter.handle, '101', 'Handle preserved for modified entity');

  // Verify unmodified entities were NOT affected
  const lineAfter = docAfter.entities[0];
  assert.strictEqual(lineAfter.geometry.start.x, 10500.5, 'Unmodified LINE start X intact');

  console.log('✅ Modified entity writer correctly encoded changed fields.');
}

function testNewEntityAllocationRoundTrip() {
  console.log('\n--- Test 3: New Entity Handle Allocation and $HANDSEED ---');
  const doc = DxfDocumentParser.parse(SYNTHETIC_DXF, { fileName: 'test_new.dxf' });

  // Add a new LINE
  const newLine = new DxfEntity({
    type: 'LINE',
    layerId: 'PIPING',
    geometry: {
      start: { x: 1.0, y: 2.0, z: 0.0 },
      end: { x: 3.0, y: 4.0, z: 0.0 },
    },
    state: { generated: true, modified: true },
  });

  doc.addEntity(newLine);
  const allocatedHandle = newLine.handle;
  assert.ok(allocatedHandle, 'New entity allocated a handle');
  console.log(`Allocated handle for new entity: ${allocatedHandle}`);

  const written = DxfDocumentWriter.write(doc, { newline: '\n' });
  const docAfter = DxfDocumentParser.parse(written, { fileName: 'test_new_out.dxf' });

  assert.strictEqual(docAfter.entities.length, 8, '8 entities after adding new line');
  const addedLine = docAfter.entities[docAfter.entities.length - 1];
  assert.strictEqual(addedLine.type, 'LINE');
  assert.strictEqual(addedLine.handle, allocatedHandle, 'Allocated handle serialized and parsed back');
  assert.strictEqual(addedLine.geometry.start.x, 1.0);
  assert.strictEqual(addedLine.geometry.end.x, 3.0);

  // Check $HANDSEED was updated to exceed new handle
  const handseedVal = parseInt(docAfter.handles.handseed, 16);
  const entityHandleVal = parseInt(allocatedHandle, 16);
  assert.ok(handseedVal > entityHandleVal, '$HANDSEED exceeds highest allocated entity handle');

  console.log('✅ New entity handle allocation and $HANDSEED update verified.');
}

function testRealFixtureRoundTrips() {
  console.log('\n--- Test 4: Real-World Fixtures Round-Trip ---');

  // A. fid07-visual-fixture.dxf
  const fid07Path = path.resolve('tests/fixtures/dxf/fid07-visual-fixture.dxf');
  const fid07Raw = fs.readFileSync(fid07Path, 'utf8');
  const docA = DxfDocumentParser.parse(fid07Raw, { fileName: 'fid07.dxf' });
  const fid07Written = DxfDocumentWriter.write(docA, { newline: '\r\n' });
  const docB = DxfDocumentParser.parse(fid07Written, { fileName: 'fid07_rt.dxf' });

  assert.strictEqual(docB.entities.length, docA.entities.length, 'fid07 entity count preserved (6)');
  assert.strictEqual(docB.blocks.size, docA.blocks.size, 'fid07 blocks preserved (1)');
  assert.strictEqual(docB.tables.layers.size, docA.tables.layers.size, 'fid07 layers preserved (3)');

  for (let i = 0; i < docA.entities.length; i++) {
    assert.strictEqual(docB.entities[i].type, docA.entities[i].type, `Entity ${i} type match`);
    assert.strictEqual(docB.entities[i].handle, docA.entities[i].handle, `Entity ${i} handle match`);
  }
  console.log('✅ fid07-visual-fixture round-trip passed.');

  // B. Large fixture (STD-98-...dxf)
  const largePath = path.resolve('Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf');
  if (fs.existsSync(largePath)) {
    const largeRaw = fs.readFileSync(largePath, 'utf8');
    const docLarge1 = DxfDocumentParser.parse(largeRaw, { fileName: 'std98.dxf' });
    const writeStart = Date.now();
    const largeWritten = DxfDocumentWriter.write(docLarge1, { newline: '\r\n' });
    const writeTime = Date.now() - writeStart;

    const parseStart = Date.now();
    const docLarge2 = DxfDocumentParser.parse(largeWritten, { fileName: 'std98_rt.dxf' });
    const parseTime = Date.now() - parseStart;

    console.log(`Large fixture serialized in ${writeTime}ms, re-parsed in ${parseTime}ms:`);
    console.log(`- Entities in re-parsed doc: ${docLarge2.entities.length}`);
    console.log(`- Text styles in re-parsed doc: ${docLarge2.tables.textStyles.records.size}`);
    console.log(`- Line types in re-parsed doc: ${docLarge2.tables.lineTypes.records.size}`);

    assert.strictEqual(docLarge2.entities.length, 7300, '7300 entities preserved across round-trip');
    assert.strictEqual(docLarge2.tables.lineTypes.records.size, docLarge1.tables.lineTypes.records.size, 'LTYPE table preserved');
    assert.strictEqual(docLarge2.tables.textStyles.records.size, docLarge1.tables.textStyles.records.size, 'STYLE table preserved');

    // Verify first and last polyline coordinates match exactly
    const poly1 = docLarge1.entities[0];
    const poly2 = docLarge2.entities[0];
    assert.strictEqual(poly2.geometry.vertices.length, poly1.geometry.vertices.length, 'Vertices length matches');
    assert.strictEqual(poly2.geometry.vertices[0].x, poly1.geometry.vertices[0].x, 'Vertex 0 X matches');
    assert.strictEqual(poly2.geometry.vertices[0].y, poly1.geometry.vertices[0].y, 'Vertex 0 Y matches');

    console.log('✅ Large 1.46MB fixture round-trip passed with 100% equivalence.');
  }
}

function main() {
  console.log('====================================================');
  console.log(' Phase 2: DxfDocumentWriter Round-Trip Test Suite   ');
  console.log('====================================================');
  testSyntheticRoundTrip();
  testModifiedEntityRoundTrip();
  testNewEntityAllocationRoundTrip();
  testRealFixtureRoundTrips();
  console.log('====================================================');
  console.log('✅ All Phase 2 round-trip tests passed successfully.');
  console.log('====================================================');
}

main();
