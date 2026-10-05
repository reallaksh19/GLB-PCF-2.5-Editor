import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { DxfDocumentParser as Parser } from '../../../formats/dxf/parser/dxf-document-parser.js';
import { DxfTokenStream } from '../../../formats/dxf/parser/dxf-token-stream.js';
import { DxfHandleRegistry } from '../../../formats/dxf/model/dxf-handle-registry.js';

const section = (name, body) => '0\nSECTION\n2\n' + name + '\n' + body + '0\nENDSEC\n';
const drawing = (body, header = '') => (header ? section('HEADER', header) : '') + section('ENTITIES', body) + '0\nEOF\n';
const line = (handle = '') => '0\nLINE\n' + (handle ? '5\n' + handle + '\n' : '') + '10\n106283.6941\n20\n-44542.5897\n11\n117718.3244\n21\n-55277.9239\n';
const text = (content = 'B 31.4', extra = '') => '0\nTEXT\n5\nA\n10\n106492.2368\n20\n-50961.8388\n40\n116.65\n1\n' + content + '\n' + extra;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('DXF floating values accept decimal exponents and reject JavaScript hexadecimal literals', () => {
  const valid = Parser.parse(drawing(line('A').replace('106283.6941', '+1.062836941e5')));
  assert.equal(valid.readOnly, false);
  assert.equal(valid.entities[0].geometry.start.x, 106283.6941);
  const invalid = Parser.parse(drawing(line('A').replace('106283.6941', '0x1')));
  assert.equal(invalid.readOnly, true);
  assert.ok(invalid.diagnostics.some(d => d.code === 'INVALID_NUMERIC_VALUE'));
  assert.ok(Number.isNaN(invalid.entities[0].geometry.start.x));
});

test('preserves BOM, whitespace, mixed newlines, repeated sections and all byte spans', () => {
  const source = '\uFEFF' + section('CUSTOM', '999\nfirst\n').replace(/\n/g, '\r\n') + section('CUSTOM', '999\nsecond\n') + drawing(line('A')) + '\r\n';
  const bytes = new TextEncoder().encode(source);
  const doc = Parser.parse(bytes, { documentId: 'test-doc' });
  assert.equal(digest(doc.originalBytes), digest(bytes));
  assert.equal(doc.source.newline, 'mixed');
  assert.equal(doc.raw.sectionRecords.filter(s => s.name === 'CUSTOM').length, 2);
  assert.equal(doc.entities.length, 1);
  const entity = doc.entities[0];
  assert.equal(entity.geometry.start.x, 106283.6941);
  const first = entity.source.rawTags[0];
  assert.equal(new TextDecoder().decode(doc.originalBytes.slice(first.valueSpan.start, first.valueSpan.end)), 'LINE');
  assert.equal(entity.source.typeLexeme, 'LINE');
  assert.equal(doc.source.byteFidelity, 'exact-input-bytes');
});

test('input/output byte mutation and token mutation cannot alter retained original bytes', () => {
  const bytes = new TextEncoder().encode(drawing(line('A')));
  const expected = digest(bytes), doc = Parser.parse(bytes);
  bytes.fill(0);
  doc.originalBytes.fill(0);
  assert.equal(digest(doc.originalBytes), expected);
  assert.throws(() => { doc.entities[0].source.rawTags[0].code = 999; }, TypeError);
});

for (const ending of ['\n', '\r\n', '\r']) {
  test('accepts and preserves line endings ' + JSON.stringify(ending), () => {
    const source = drawing(line('A')).replace(/\n/g, ending);
    const doc = Parser.parse(source);
    assert.equal(doc.readOnly, false);
    assert.equal(doc.source.newline, ending);
    assert.equal(new TextDecoder().decode(doc.originalBytes), source);
  });
}

test('Uint8Array offset and ArrayBuffer inputs retain only the supplied source', () => {
  const source = new TextEncoder().encode(drawing(line('A')));
  const wrapper = new Uint8Array(source.length + 8); wrapper.set(source, 4);
  assert.deepEqual(Parser.parse(wrapper.subarray(4, -4)).originalBytes, source);
  assert.deepEqual(Parser.parse(source.buffer).originalBytes, source);
});

test('duplicate/missing handles preserve source and receive distinct document-scoped IDs', () => {
  const source = drawing(line('A') + line('a') + line());
  const a = Parser.parse(source, { documentId: 'doc-a' });
  const b = Parser.parse(source, { documentId: 'doc-b' });
  assert.equal(new Set(a.entities.map(e => e.id)).size, 3);
  assert.equal(a.entities[2].handle, null);
  assert.notEqual(a.entities[0].id, b.entities[0].id);
  assert.equal(new TextDecoder().decode(a.originalBytes), source);
  assert.ok(a.diagnostics.some(d => d.code === 'DUPLICATE_HANDLE'));
  assert.equal(a.handles.handseed, 'B'); // Missing handle did not allocate.
});

test('opaque object, table, block terminator and sequence handles enter the global registry', () => {
  const source = section('TABLES', '0\nTABLE\n2\nSTYLE\n5\nFF\n0\nSTYLE\n2\nSTANDARD\n5\n100\n0\nENDTAB\n')
    + section('BLOCKS', '0\nBLOCK\n2\nSYMBOL\n5\n101\n0\nLINE\n5\n102\n10\n0\n20\n0\n11\n1\n21\n1\n0\nENDBLK\n5\n103\n')
    + section('ENTITIES', '0\nPOLYLINE\n5\n104\n0\nVERTEX\n5\n105\n10\n4\n20\n5\n0\nSEQEND\n5\n106\n')
    + section('OBJECTS', '0\nDICTIONARY\n5\n20000000000000\n330\n0\n')
    + '0\nEOF\n';
  const doc = Parser.parse(source);
  assert.equal(doc.readOnly, false);
  for (const h of ['FF','100','101','102','103','104','105','106','20000000000000']) assert.ok(doc.handles.has(h), h);
  assert.equal(doc.handles.allocate(), '20000000000001');
  assert.equal(doc.handles.allocate(), '20000000000002');
  assert.equal(doc.objects.length, 1);
  assert.equal(doc.entities[0].geometry.vertices[0].x, 4);
  assert.ok(doc.entities[0].source.seqendRecordId);
  assert.equal(doc.blocks.get('SYMBOL').entities[0].definitionId, doc.blocks.get('SYMBOL').id);
});

test('HANDSEED is the next available handle and exact 64-bit allocation cannot collide', () => {
  const registry = new DxfHandleRegistry('1FF');
  assert.equal(registry.handseed, '1FF');
  assert.equal(registry.allocate(), '1FF');
  registry.register('20000000000000');
  assert.equal(registry.allocate(), '20000000000001');
  assert.equal(registry.allocate(), '20000000000002');
  assert.equal(registry.register('L1'), false);
  const exhausted = new DxfHandleRegistry(); exhausted.register('FFFFFFFFFFFFFFFF');
  assert.throws(() => exhausted.allocate(), /exhausted/);
});

test('repeated named VPORT records retain ordered resources', () => {
  const source = section('TABLES', '0\nTABLE\n2\nVPORT\n0\nVPORT\n2\n*ACTIVE\n5\nA\n0\nVPORT\n2\n*ACTIVE\n5\nB\n0\nENDTAB\n') + drawing(line('C'));
  const doc = Parser.parse(source);
  assert.equal(doc.tables.viewPorts.orderedRecords.length, 2);
  assert.deepEqual([...doc.tables.viewPorts].map(r => r.handle), ['A', 'B']);
  assert.ok(doc.tables.viewPorts.source.headerRawTags[0].span);
});

test('model/paper spaces, styles and native labels preserve independent identity', () => {
  const source = drawing(line('B') + text('B 31.4', '8\nMixed Case Layer\n67\n1\n410\nLayout One\n420\n65280\n6\nBYBLOCK\n370\n-2\n41\n0.8\n7\nS3-5\n50\n359.9929917\n'));
  const doc = Parser.parse(source);
  const label = doc.entities[1];
  assert.equal(doc.modelSpace.length, 1);
  assert.equal(doc.paperSpaces.get('Layout One').length, 1);
  assert.equal(label.style.colorMode, 'TRUECOLOR');
  assert.equal(label.style.lineTypeMode, 'BYBLOCK');
  assert.equal(label.style.lineWeightMode, 'BYBLOCK');
  assert.equal(label.layerId, 'Mixed Case Layer');
  assert.equal(label.attributes.widthFactor, 0.8);
  assert.equal(label.attributes.styleName, 'S3-5');
});

test('reactors do not overwrite native owner/handle and XDATA stays retained', () => {
  const source = drawing('0\nLINE\n5\nA\n102\n{ACAD_REACTORS\n330\nDEAD\n102\n}\n330\n1F\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n1\n20\n2\n11\n3\n21\n4\n1001\nAPP\n1000\nopaque payload\n');
  const doc = Parser.parse(source);
  assert.equal(doc.entities[0].ownerHandle, '1F');
  assert.equal(doc.entities[0].source.rawTags.find(t => t.code === 1000).value, 'opaque payload');
  assert.equal(doc.entities[0].geometry.start.x, 1);
});

test('legacy ANSI codepage byte input decodes text without rewriting original bytes', () => {
  const source = drawing(text('Caf\u00e9'), '9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n');
  const bytes = Uint8Array.from(Buffer.from(source, 'latin1')), doc = Parser.parse(bytes);
  assert.equal(doc.source.encoding, 'windows-1252');
  assert.equal(doc.entities[0].attributes.text, 'Caf\u00e9');
  assert.deepEqual(doc.originalBytes, bytes);
});

test('modern DXF uses UTF8 even with legacy codepage metadata', () => {
  const bytes = new TextEncoder().encode(drawing(text('\u0394'), '9\n$ACADVER\n1\nAC1032\n9\n$DWGCODEPAGE\n3\nANSI_1252\n'));
  const doc = Parser.parse(bytes);
  assert.equal(doc.entities[0].attributes.text, '\u0394');
  assert.equal(doc.source.encoding, 'utf-8');
  assert.deepEqual(doc.originalBytes, bytes);
});

for (const source of [
  '40junk\n1\n0\nEOF\n',
  drawing(line('A')) + '1\norphan after EOF\n',
  '0\nSECTION\n2\nENTITIES\n' + line('A') + '0\nEOF\n',
  '0\nSECTION\n2\nENTITIES\n' + line('A') + '0\nENDSEC\n',
  '0\nSECTION\n',
  drawing(line('A').replace('106283.6941', 'not-a-number')),
]) {
  test('malformed source preserves bytes and blocks native editing/Save: ' + source.slice(0, 25), () => {
    const doc = Parser.parse(source);
    assert.equal(doc.readOnly, true);
    assert.equal(doc.capabilities.nativeEditing, false);
    assert.equal(doc.capabilities.nativeSave, false);
    assert.equal(new TextDecoder().decode(doc.originalBytes), source);
    assert.ok(doc.diagnostics.some(d => d.severity === 'error'));
  });
}

test('required TEXT group 40 absence is explicit and never invented as 2.5', () => {
  const doc = Parser.parse(drawing(text().replace('40\n116.65\n', '')));
  assert.equal(doc.readOnly, true);
  assert.ok(doc.diagnostics.some(d => d.code === 'REQUIRED_TEXT_HEIGHT_MISSING'));
  assert.equal(doc.entities[0].attributes.height, null);
});

test('missing sequence/block/table terminators cannot swallow the following section', () => {
  for (const prefix of [
    section('ENTITIES', '0\nPOLYLINE\n5\nA\n0\nVERTEX\n10\n1\n20\n2\n'),
    section('BLOCKS', '0\nBLOCK\n2\nBAD\n' + line('A')),
    section('TABLES', '0\nTABLE\n2\nSTYLE\n0\nSTYLE\n2\nSTANDARD\n'),
  ]) {
    const doc = Parser.parse(prefix + drawing(line('B')));
    assert.equal(doc.readOnly, true);
    assert.ok(doc.entities.some(e => e.handle === 'B'));
  }
});

test('unknown entities, CLASSES and repeated custom sections are first-class preserved records', () => {
  const source = section('CLASSES','0\nCLASS\n1\nExample\n') + section('CUSTOM','999\none\n')
    + section('CUSTOM','999\ntwo\n') + drawing('0\nMY_UNKNOWN\n5\nF\n1001\nAPP\n1000\nopaque\n');
  const doc = Parser.parse(source);
  assert.equal(doc.classes.length, 1);
  assert.equal(doc.entities[0].type, 'MY_UNKNOWN');
  assert.equal(doc.entities[0].attributes.isPreservedUnknown, true);
  assert.equal(doc.raw.sectionRecords.length, 4);
  assert.equal(new TextDecoder().decode(doc.originalBytes), source);
});

test('unsupported binary, unsupported codepage and invalid encoding retain recoverable bytes', () => {
  const binary = Uint8Array.from(Buffer.from('AutoCAD Binary DXF\r\n\x1a\0binary', 'latin1'));
  const doc = Parser.parse(binary);
  assert.equal(doc.readOnly, true);
  assert.ok(doc.diagnostics.some(d => d.code === 'UNSUPPORTED_BINARY_DXF'));
  assert.deepEqual(doc.originalBytes, binary);
  const unsupported = Parser.parse(new TextEncoder().encode(drawing(text(), '9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_99999\n')));
  assert.equal(unsupported.readOnly, true);
  const invalid = new TextEncoder().encode(drawing(text('X')));
  const index = Buffer.from(invalid).indexOf(Buffer.from('1\nX\n')); invalid[index + 2] = 255;
  const broken = Parser.parse(invalid);
  assert.equal(broken.readOnly, true);
  assert.ok(broken.diagnostics.some(d => d.code === 'DECODE_ERROR'));
  assert.deepEqual(broken.originalBytes, invalid);
});

test('caller string input truthfully reports provided UTF8 text, not unseen original bytes', () => {
  const doc = Parser.parse(drawing(line('A')));
  assert.equal(doc.capabilities.preservation, 'provided-utf8-text');
});

const sxnPath = process.env.CAD_SXN_PATH;
test('authorized SXN structural gate (explicit local fixture path required)', { skip: !sxnPath && 'UNRUN: CAD_SXN_PATH absent; drawing not published' }, () => {
  const bytes = fs.readFileSync(sxnPath);
  assert.equal(digest(bytes), 'b6f1e24c07ec8be85f5e2f92fb32610a52e44d870f12c094fd2f386d6a870c6f');
  const doc = Parser.parse(bytes);
  assert.equal(doc.readOnly, false);
  assert.equal(doc.modelSpace.length, 653);
  assert.equal(doc.blockRecords.length, 80);
  const counts = {};
  for (const entity of doc.modelSpace) counts[entity.type] = (counts[entity.type] || 0) + 1;
  for (const [type, expected] of Object.entries({ TEXT:109, MTEXT:1, DIMENSION:48, LEADER:21, HATCH:12, WIPEOUT:8, INSERT:70, CIRCLE:29 })) assert.equal(counts[type], expected, type);
  for (const layer of ['600LB','0','PIPING_VALVE FITTINGS','2101','G_TEXT_W']) assert.ok(doc.getLayer(layer), layer);
  const annotation = doc.entities.find(e => e.handle === 'AD08');
  assert.equal(annotation.attributes.text, 'B 31.4');
  assert.equal(annotation.attributes.height, 116.65);
  assert.equal(annotation.attributes.widthFactor, 0.8);
  assert.equal(annotation.attributes.styleName, 'S3-5');
  assert.equal(doc.units.insunits, 1);
  assert.equal(new Set(doc.entityIndex.keys()).size, doc.entityIndex.size);
  assert.equal(digest(doc.originalBytes), digest(bytes));
});
