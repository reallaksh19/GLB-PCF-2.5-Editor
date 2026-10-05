import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DxfDocumentParser as P} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfDocumentWriter as W} from '../../../formats/dxf/writer/dxf-document-writer.js';
import {DxfEntity} from '../../../formats/dxf/model/dxf-entity.js';
const wrap=tags=>['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$HANDSEED','5','FF','0','ENDSEC','0','SECTION','2','ENTITIES',...tags,'0','ENDSEC','0','EOF'].join('\n');
const line=['0','LINE','5','A1','8','0','10','0','20','0','30','5','11','10','21','0','31','5'];
const request=d=>({mode:'native-save',targetFormat:'dxf',documentId:d.id,revision:d.revision,contentStateId:d.contentStateId,encodingPolicy:'preserve'});
test('Create uses committed handles, writes HANDSEED and stays pure across repeated Save',()=>{
 const d=P.parse(wrap(line)); const e=new DxfEntity({type:'LINE',handle:d.handles.allocate(),geometry:{start:{x:20,y:0,z:5},end:{x:30,y:0,z:5}},state:{generated:true}});d.addEntity(e);
 const seed=d.handles.nextNumericHandle, known=[...d.handles.knownHandles];
 const out=W.writeBytes(d), next=P.parse(out);
 assert.equal(next.entities.length,2);assert.equal(next.entities[1].handle,e.handle);assert.equal(next.entities[1].geometry.start.z,5);
 assert.equal(next.header.get('$HANDSEED'),d.handles.handseed);assert.equal(d.handles.nextNumericHandle,seed);assert.deepEqual([...d.handles.knownHandles],known);
 assert.deepEqual(W.writeBytes(d),out);
});
test('Delete fails if an untouched source object refers to the target',()=>{
 const input=wrap(line).replace('0\nEOF','0\nSECTION\n2\nOBJECTS\n0\nACME\n5\nB1\n330\nA1\n0\nENDSEC\n0\nEOF');
 const d=P.parse(input);d.entities[0].markDeleted();assert.throws(()=>W.writeBytes(d),/Dangling source reference/);
});
test('Undoing a generated addition returns exact original bytes despite reserved session handles',()=>{
 const input=Buffer.from(wrap(line)),d=P.parse(input); const e=new DxfEntity({type:'LINE',handle:d.handles.allocate(),geometry:{start:{x:1,y:2,z:5},end:{x:3,y:4,z:5}},state:{generated:true}});d.addEntity(e);
 W.writeBytes(d);d.entities.pop();d.entityIndex.delete(e.id);
 assert.deepEqual(Buffer.from(W.writeBytes(d)),input);assert.ok(d.handles.has(e.handle));
});
test('Generated text requires an explicit positive native height',()=>{
 const d=P.parse(wrap(line));d.addEntity(new DxfEntity({type:'TEXT',handle:d.handles.allocate(),geometry:{insertionPoint:{x:0,y:0,z:5}},attributes:{text:'T'},state:{generated:true}}));
 assert.throws(()=>W.writeBytes(d),/height/);
});
test('Representable Windows-1252 text edits retain the source codepage',()=>{
 const text=wrap(['0','TEXT','5','A1','10','0','20','0','40','1','1','OLD']).replace('9\n$HANDSEED','9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$HANDSEED');
 const d=P.parse(Buffer.from(text,'latin1'));d.entities[0].attributes.text='Café';const out=W.writeBytes(d);
 assert.ok(Buffer.from(out).includes(Buffer.from('Café','latin1')));assert.equal(P.parse(out).entities[0].attributes.text,'Café');
});
test('Chunked MTEXT text edits replace native chunks while opaque data survives',()=>{
 const d=P.parse(wrap(['0','MTEXT','5','A1','10','0','20','0','40','1','3','PART','1','OLD','1001','APP','1000','opaque']));d.entities[0].attributes.text='Z'.repeat(520);
 const out=W.writeBytes(d), next=P.parse(out);assert.equal(next.entities[0].attributes.text,'Z'.repeat(520));assert.ok(new TextDecoder().decode(out).includes('opaque'));
});
test('Save captures content before asynchronous hashing; delayed acknowledgement leaves later edits dirty',async()=>{
 const d=P.parse(wrap(line)),expected=W.writeBytes(d);const saving=W.serialize(d,request(d));
 d.entities[0].geometry.start.x=99;d.entities[0].markModified();d.revision++;d.contentStateId=d.id+':content:1';d.knownContentStates.add(d.contentStateId);
 const result=await saving;assert.deepEqual(result.bytesOrChunks,expected);assert.equal(result.sourceRevision,0);
 assert.equal(result.outputDigest,createHash('sha256').update(expected).digest('hex'));
 assert.equal(d.acknowledgeSave(result,false),false);assert.equal(d.acknowledgeSave(result,true),true);assert.equal(d.dirty,true);
 const current=await W.serialize(d,request(d));d.acknowledgeSave(current,true);assert.equal(d.dirty,false);
});
test('Wrong format/mode, stale revision and cancelled Save fail without acknowledgement',async()=>{
 const d=P.parse(wrap(line)),r=request(d);
 for(const bad of [{...r,mode:'conversion'},{...r,targetFormat:'glb'},{...r,revision:2},{...r,cancellationToken:{aborted:true}}])await assert.rejects(W.serialize(d,bad));
 assert.equal(d.savedContentStateId,d.contentStateId);
});
test('Regenerated copies preserve opaque undecodable application bytes without decoding them',()=>{
 const input=Buffer.from(wrap([...line,'1001','APP','1000','X']));
 input[input.indexOf('\nX\n')+1]=255;const d=P.parse(input),source=d.entities[0];
 const e=new DxfEntity({type:'LINE',handle:d.handles.allocate(),geometry:structuredClone(source.geometry),style:source.style,state:{generated:true}});
 e.source.copiedRawTags=source.source.rawTags;d.addEntity(e);
 const output=Buffer.from(W.writeBytes(d));assert.equal(output.filter(x=>x===255).length,2);assert.equal(d.readOnly,false);
});
