import assert from 'node:assert/strict';
import { test as check } from 'node:test';
import crypto from 'node:crypto';
import { DxfDocumentParser as Parser } from '../../../formats/dxf/parser/dxf-document-parser.js';
import { DxfDocumentWriter as Writer } from '../../../formats/dxf/writer/dxf-document-writer.js';
import { composeBytes } from '../../../formats/dxf/writer/dxf-field-overlays.js';

const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const wrap = body => ['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','9','$HANDSEED','5','FF','0','ENDSEC','0','SECTION','2','ENTITIES', ...body,'0','ENDSEC','0','EOF'].join('\n');
const line = ['0','LINE','5','A1','8','0','10','1.000000','20','2','30','0','11','3','21','4','31','0'];
function pairs(text) {
  const lines = text.split(/\r?\n/), result = [];
  for(let i=0;i+1<lines.length;i+=2) result.push({code:Number(lines[i].trim()), value:lines[i+1]});
  return result;
}
check('Positive control: explicit LINE coordinate edit reaches output', () => {
  const doc=Parser.parse(wrap(line)); doc.entities[0].geometry.start.x=99; doc.entities[0].markModified();
  assert.equal(Parser.parse(Writer.write(doc)).entities[0].geometry.start.x,99);
});
check('Positive control: serialization does not mutate live handle registry', () => {
  const doc=Parser.parse(wrap(line)); const before=doc.handles.nextNumericHandle; const known=[...doc.handles.knownHandles];
  Writer.write(doc); assert.equal(doc.handles.nextNumericHandle,before); assert.deepEqual([...doc.handles.knownHandles],known);
});
check('No-op Save preserves exact original UTF-8 bytes, lexemes, LF and EOF', () => {
  const input = wrap(line).replace('\n10\n1.000000', '\n 10\n1.000000');
  const output = Writer.write(Parser.parse(input));
  assert.equal(digest(output),digest(input),`Input ${digest(input)} / output ${digest(output)}; lengths ${input.length}/${output.length}`);
});
check('No-op Save retains integer HEADER group codes and INSUNITS=4', () => {
  const input = wrap(line), output = Writer.write(Parser.parse(input));
  const tags=pairs(output), index=tags.findIndex(t=>t.code===9&&t.value==='$INSUNITS');
  assert.equal(tags[index+1].code,70,`$INSUNITS emitted with group ${tags[index+1].code}, expected 70`);
  assert.equal(Parser.parse(output).units.insunits,4);
});
check('No-op Save retains original HANDSEED=FF', () => {
  const output=Writer.write(Parser.parse(wrap(line))), tags=pairs(output), index=tags.findIndex(t=>t.code===9&&t.value==='$HANDSEED');
  assert.equal(tags[index+1].value,'FF');
});
check('Single-field LINE edit retains untouched XDATA', () => {
  const doc=Parser.parse(wrap([...line,'1001','MY_APP','1000','OPAQUE_PAYLOAD']));
  doc.entities[0].geometry.start.x=2; doc.entities[0].markModified();
  const tags=pairs(Writer.write(doc));
  assert.ok(tags.some(t=>t.code===1001&&t.value==='MY_APP'),'LINE edit dropped group1001 MY_APP');
  assert.ok(tags.some(t=>t.code===1000&&t.value==='OPAQUE_PAYLOAD'));
});
check('Unknown modified entity rejects unsupported Save rather than replaying stale raw data', () => {
  const doc=Parser.parse(wrap(['0','ACME_WIDGET','5','A1','8','0','1','ORIGINAL']));
  doc.entities[0].attributes.changed='EDIT_REQUEST'; doc.entities[0].markModified();
  assert.throws(()=>Writer.write(doc),/unsupported|cannot serialize|unknown/i);
});
check('Unmodified INSERT/ATTRIB emits exactly one group66 marker', () => {
  const doc=Parser.parse(wrap(['0','INSERT','5','A1','8','0','2','B','66','1','10','1','20','2','30','0','0','ATTRIB','5','A2','8','0','10','1','20','2','30','0','40','1','1','OLD','2','TAG','0','SEQEND','5','A3']));
  assert.equal(pairs(Writer.write(doc)).filter(t=>t.code===66).length,1);
});
check('Modified POLYLINE vertex writes the requested coordinate instead of stale rawTags', () => {
  const doc=Parser.parse(wrap(['0','POLYLINE','5','A1','8','0','66','1','70','0','0','VERTEX','5','A2','8','0','10','1','20','2','30','0','0','VERTEX','5','A3','8','0','10','3','20','4','30','0','0','SEQEND','5','A4']));
  doc.entities[0].geometry.vertices[0].x=99; doc.entities[0].markModified();
  const after=Parser.parse(Writer.write(doc));
  assert.equal(after.entities[0].geometry.vertices[0].x,99);
});
check('An unrelated LINE edit preserves an opaque entity exact original text span', () => {
  const opaque=['  0','ACME_WIDGET','  5','BB','  8','0','999',' Keep whitespace '].join('\n');
  const input=wrap(line).replace('\n0\nENDSEC\n0\nEOF','\n'+opaque+'\n0\nENDSEC\n0\nEOF');
  const doc=Parser.parse(input); doc.entities[0].geometry.start.x=99; doc.entities[0].markModified();
  assert.ok(Writer.write(doc).includes(opaque),'Untouched opaque record group-code padding/newlines rewritten');
});
check('Invalid edited coordinates fail explicitly instead of silently becoming zero', () => {
  const doc=Parser.parse(wrap(line)); doc.entities[0].geometry.start.x=NaN; doc.entities[0].markModified();
  assert.throws(()=>Writer.write(doc),/finite|invalid|coordinate/i);
});

for (const newline of ['\n', '\r\n', '\r']) check('Byte API retains BOM, padding and ' + JSON.stringify(newline), () => {
  const input = Buffer.concat([Buffer.from([239,187,191]), Buffer.from(wrap(line).replaceAll('\n', newline))]);
  assert.deepEqual(Buffer.from(Writer.writeBytes(Parser.parse(input))), input);
});
check('Mixed newlines, opaque sections and trailing whitespace remain byte-identical', () => {
  const input = Buffer.from(wrap(line).replace('0\nSECTION', '0\r\nSECTION').replace('0\nEOF', '0\nSECTION\n2\nVENDOR\n0\nACME\n1\n untouched \n0\nENDSEC\n0\nEOF') + '\n  ');
  assert.deepEqual(Buffer.from(Writer.writeBytes(Parser.parse(input))), input);
});
check('One numeric edit changes exactly its value span, preserving control groups and lexemes', () => {
  const text = wrap([...line, '102','{APP','10','500','102','}','1001','APP','1010','100']);
  const input = Buffer.from(text), doc = Parser.parse(input);
  doc.entities[0].geometry.start.x = 99;
  assert.deepEqual(Buffer.from(Writer.writeBytes(doc)), Buffer.from(text.replace('\n1.000000\n','\n99\n')));
});
const textTags = ['0','TEXT','5','A1','8','0','10','1','20','2','30','0','40','1','1','Café'];
const ansi = () => Buffer.from(wrap(textTags).replace('9\n$INSUNITS', '9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$INSUNITS'), 'latin1');
check('Windows-1252 source remains byte-identical', () => {
  const input = ansi(), doc = Parser.parse(input);
  assert.equal(doc.source.encoding, 'windows-1252');
  assert.deepEqual(Buffer.from(Writer.writeBytes(doc)), input);
});
check('ASCII edit retains untouched Windows-1252 text bytes', () => {
  const input = ansi(), doc = Parser.parse(input);
  doc.entities[0].geometry.insertionPoint.x = 99;
  assert.deepEqual(Buffer.from(Writer.writeBytes(doc)), Buffer.from(input.toString('latin1').replace('\n10\n1\n','\n10\n99\n'), 'latin1'));
});
check('Unencodable source-codepage text edit rejects without mutating the document', () => {
  const doc = Parser.parse(ansi()); doc.entities[0].attributes.text = '水';
  const before = doc.originalBytes;
  assert.throws(() => Writer.writeBytes(doc), /encoding/);
  assert.deepEqual(doc.originalBytes, before);
  assert.equal(doc.entities[0].attributes.text, '水');
});
check('UTF-8 text edit writes intended characters and retains required height', () => {
  const doc = Parser.parse(Buffer.from(wrap(textTags).replace('AC1015','AC1021')));
  doc.entities[0].attributes.text = '水';
  const after = Parser.parse(Writer.writeBytes(doc));
  assert.equal(after.entities[0].attributes.text, '水');
  assert.equal(after.entities[0].attributes.height, 1);
});
check('Missing optional vertex tags insert at their own vertex, and negative bulge survives', () => {
  const doc = Parser.parse(wrap(['0','LWPOLYLINE','5','A1','8','0','90','2','70','0','10','1','20','2','10','3','20','4']));
  doc.entities[0].geometry.vertices[0].bulge = -1;
  doc.entities[0].geometry.vertices[0].startWidth = 2;
  const vertices = Parser.parse(Writer.writeBytes(doc)).entities[0].geometry.vertices;
  assert.equal(vertices[0].bulge, -1); assert.equal(vertices[0].startWidth, 2);
  assert.equal(vertices[1].bulge, 0); assert.equal(vertices[1].x, 3);
});
check('Vertex topology change rejects rather than misassigning source fields', () => {
  const doc = Parser.parse(wrap(['0','LWPOLYLINE','90','1','10','1','20','2']));
  doc.entities[0].geometry.vertices.push({x:3,y:4});
  assert.throws(() => Writer.writeBytes(doc), /topology/);
});
check('Changing closed flag retains the remaining POLYLINE flag bits', () => {
  const doc = Parser.parse(wrap(['0','LWPOLYLINE','90','1','70','128','10','1','20','2']));
  doc.entities[0].geometry.closed = true;
  const after = Parser.parse(Writer.writeBytes(doc));
  assert.equal(after.entities[0].attributes.flags,129);
});
check('Edited ATTRIB value preserves its INSERT marker and attribute metadata', () => {
  const doc = Parser.parse(wrap(['0','INSERT','5','A1','2','B','66','1','10','0','20','0','0','ATTRIB','5','A2','10','0','20','0','40','1','1','OLD','2','TAG','1001','APP','1000','OPAQUE','0','SEQEND','5','A3']));
  doc.entities[0].attributes.attribs[0].attributes.text = 'NEW';
  const out = Writer.write(doc), after = Parser.parse(out);
  assert.equal(after.entities[0].attributes.attribs[0].attributes.text,'NEW');
  assert.equal(pairs(out).filter(t=>t.code===66).length,1);
  assert.ok(out.includes('OPAQUE'));
});
check('Resource changes require an explicit plan instead of being ignored', () => {
  const doc = Parser.parse(wrap(line)); doc.header.set('$INSUNITS','8');
  assert.throws(() => Writer.writeBytes(doc), /resource mutation/);
});
check('Record deletion is rejected without transaction closure', () => {
  const doc = Parser.parse(wrap(line)); doc.entities[0].markDeleted();
  assert.throws(() => Writer.writeBytes(doc), /topology/);
});
check('Unsupported field changes do not silently replay stale geometry', () => {
  const doc = Parser.parse(wrap(line)); doc.entities[0].geometry.unsupportedField = 100;
  assert.throws(() => Writer.writeBytes(doc), /Unsupported mutation/);
});
check('Ambiguous repeated native coordinates are rejected', () => {
  const doc = Parser.parse(wrap([...line,'10','20'])); doc.entities[0].geometry.start.x=99;
  assert.throws(() => Writer.writeBytes(doc), /ambiguous/);
});
check('Fatal source errors allow explicit original-byte recovery, never ordinary Save', () => {
  const input = Buffer.from(wrap(line).replace('\n1.000000\n','\nNaN\n')), doc = Parser.parse(input);
  assert.equal(doc.readOnly,true);
  assert.throws(() => Writer.writeBytes(doc), /Invalid source/);
  assert.deepEqual(Buffer.from(Writer.recoverOriginalBytes(doc)),input);
});
check('Explicit conversion requests reject rather than silently normalizing the source', () => {
  const doc = Parser.parse(wrap(line));
  for (const options of [{newline:'\r\n'},{acadVersion:'AC1027'},{encoding:'windows-1252'}]) {
    assert.throws(() => Writer.writeBytes(doc,options), /conversion/);
  }
});
check('Overlapping byte patches reject before output construction', () => {
  assert.throws(() => composeBytes(new Uint8Array(5), [
    {start:1,end:3,bytes:new Uint8Array()}, {start:2,end:4,bytes:new Uint8Array()},
  ]), /overlapping/);
});
check('Numeric-looking strings and fractional integer fields cannot corrupt native output', () => {
  const doc = Parser.parse(wrap(line)); doc.entities[0].geometry.start.x = 'NaN';
  assert.throws(() => Writer.writeBytes(doc), /numeric/);
  doc.entities[0].geometry.start.x = 1; doc.entities[0].style.colorIndex = 1.5;
  assert.throws(() => Writer.writeBytes(doc), /numeric/);
});
check('New field references cannot silently point to missing resources', () => {
  const doc = Parser.parse(wrap(line)); doc.entities[0].layerId = 'MISSING';
  assert.throws(() => Writer.writeBytes(doc), /dangling layer/);
  const insert = Parser.parse(wrap(['0','INSERT','2','OLD','10','0','20','0']));
  insert.entities[0].attributes.blockName = 'MISSING';
  assert.throws(() => Writer.writeBytes(insert), /dangling block/);
});
check('Edits cannot introduce a newer-version field into AC1015', () => {
  const doc = Parser.parse(wrap(line)); doc.entities[0].style.trueColor = 123;
  assert.throws(() => Writer.writeBytes(doc), /source DXF version/);
});
