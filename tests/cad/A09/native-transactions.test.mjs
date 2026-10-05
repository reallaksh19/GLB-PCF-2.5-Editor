import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DxfDocumentParser as P} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfDocumentWriter as W} from '../../../formats/dxf/writer/dxf-document-writer.js';
import {CommandHistory,CompositeCadCommand,CadCommand,MoveEntitiesCommand,CopyEntitiesCommand,DeleteEntitiesCommand,ScaleEntitiesCommand,GripEditCommand,IncrementalUpdater} from '../../../core/commands/cad/index.js';
import {DxfRenderAdapter as R} from '../../../formats/dxf/render/dxf-render-adapter.js';
import {DxfSpatialIndex} from '../../../formats/dxf/spatial/dxf-spatial-index.js';
const wrap=tags=>['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$HANDSEED','5','FF','0','ENDSEC','0','SECTION','2','ENTITIES',...tags,'0','ENDSEC','0','EOF'].join('\r\n');
const line=['0','LINE','5','A1','8','0','10','0.000','20','0','30','5','11','10','21','0','31','5'];
const make=()=>{const input=Buffer.from(wrap([...line,'1001','APP','1000',' opaque payload ']));return {input,d:P.parse(input),h:new CommandHistory()};};
test('Move Save preserves opaque payload; Undo restores all original bytes and content identity',()=>{
 const {input,d,h}=make(),id=d.entities[0].id,initial=d.contentStateId;
 const cs=h.execute(new MoveEntitiesCommand([id],3,2),d),after=d.contentStateId;
 const output=W.writeBytes(d),parsed=P.parse(output);assert.equal(parsed.entities[0].geometry.start.x,3);assert.ok(Buffer.from(output).includes(Buffer.from(' opaque payload ')));
 assert.equal(d.dirty,true);assert.deepEqual(cs.modified,[{entityId:id}]);assert.ok(!JSON.stringify(cs).includes('rawTags'));
 h.undo(d);assert.deepEqual(Buffer.from(W.writeBytes(d)),input);assert.equal(d.contentStateId,initial);assert.equal(d.dirty,false);assert.equal(d.revision,2);
 h.redo(d);assert.deepEqual(W.writeBytes(d),output);assert.equal(d.contentStateId,after);assert.equal(d.revision,3);
});
test('Copy Save/Undo/Redo retains committed identity, handle, opaque bytes and HANDSEED',()=>{
 const {input,d,h}=make();h.execute(new CopyEntitiesCommand([d.entities[0].id],20,0),d);
 const clone=d.entities[1],output=W.writeBytes(d),seed=d.handles.handseed,next=P.parse(output);
 assert.equal(next.entities[1].handle,clone.handle);assert.equal(next.entities[1].geometry.start.x,20);assert.equal(next.entities[1].geometry.start.z,5);
 assert.equal(next.entities[1].source.rawTags.find(t=>t.code===1000).value,' opaque payload ');
 h.undo(d);assert.deepEqual(Buffer.from(W.writeBytes(d)),input);assert.ok(d.handles.has(clone.handle));assert.equal(d.handles.handseed,seed);
 h.redo(d);assert.equal(d.entities[1],clone);assert.deepEqual(W.writeBytes(d),output);
});
test('Multiple Delete Undo restores byte order and every native index',()=>{
 const text=wrap([...line,...line.map((v,i)=>i===3?'A2':v)]),d=P.parse(text),h=new CommandHistory(),ids=d.entities.map(e=>e.id);
 h.execute(new DeleteEntitiesCommand(ids),d);assert.equal(d.entities.length,0);assert.equal(P.parse(W.writeBytes(d)).entities.length,0);
 h.undo(d);assert.equal(W.write(d),text);assert.deepEqual(d.modelSpace.map(e=>e.id),ids);for(const id of ids)assert.ok(d.getEntityIdsOnLayer('0').has(id));
});
test('Transaction identity rejects wrong document, stale revision and conflicting repeated payload',()=>{
 const {d,h}=make(),id=d.entities[0].id;
 const bad=new MoveEntitiesCommand([id],1,0);bad.documentId='wrong';assert.throws(()=>h.execute(bad,d),/identity/);
 const cmd=new MoveEntitiesCommand([id],1,0);Object.assign(cmd,{documentId:d.id,baseRevision:0,transactionId:'same'});const cs=h.execute(cmd,d);assert.equal(h.execute(cmd,d),cs);
 cmd.dx=2;assert.throws(()=>h.execute(cmd,d),/conflict/);assert.equal(d.entities[0].geometry.start.x,1);
 const stale=new MoveEntitiesCommand([id],1,0);stale.baseRevision=0;assert.throws(()=>h.execute(stale,d),/Stale/);assert.equal(h.undoCount,1);
});
test('Fresh histories cannot reuse a document content identity',()=>{
 const {d,h}=make(),id=d.entities[0].id;h.execute(new MoveEntitiesCommand([id],1,0),d);const a=d.contentStateId;
 new CommandHistory().execute(new MoveEntitiesCommand([id],2,0),d);assert.notEqual(d.contentStateId,a);
});
test('Overflow fails before a public event and restores exact native bytes',()=>{
 const text=wrap(line.map((v,i)=>i===7?'1e308':v)),d=P.parse(text),h=new CommandHistory();let events=0;h.subscribe(()=>events++);
 assert.throws(()=>h.execute(new MoveEntitiesCommand([d.entities[0].id],1e308,0),d),/finite/i);
 assert.equal(W.write(d),text);assert.equal(h.undoCount,0);assert.equal(d.revision,0);assert.equal(events,0);
});
test('A queued batch is all-or-nothing and cancellation has no source effect',()=>{
 const {input,d,h}=make(),id=d.entities[0].id;h.beginBatch();h.execute(new MoveEntitiesCommand([id],2,0),d);
 assert.deepEqual(Buffer.from(W.writeBytes(d)),input);h.cancelBatch();assert.equal(h.undoCount,0);
 h.beginBatch();h.execute(new MoveEntitiesCommand([id],2,0),d);h.execute(new MoveEntitiesCommand([id],3,0),d);h.endBatch();assert.equal(d.entities[0].geometry.start.x,5);assert.equal(h.undoCount,1);
 h.undo(d);assert.deepEqual(Buffer.from(W.writeBytes(d)),input);
});
test('Native POLYLINE Move Save changes vertex and elevation once; Undo retains sequence spans',()=>{
 const text=wrap(['0','POLYLINE','5','A1','8','0','66','1','30','5','70','0','0','VERTEX','5','A2','8','0','10','1','20','2','30','0','0','VERTEX','5','A3','8','0','10','3','20','4','30','0','0','SEQEND','5','A4']);
 const d=P.parse(text),h=new CommandHistory();h.execute(new MoveEntitiesCommand([d.entities[0].id],2,3,1),d);
 const next=P.parse(W.writeBytes(d));assert.equal(next.entities[0].geometry.vertices[0].x,3);assert.equal(next.entities[0].geometry.elevation,6);
 h.undo(d);assert.equal(W.write(d),text);
});
test('Uniform scale uses base Z; a 2D grip gesture retains source Z',()=>{
 const {d,h}=make(),id=d.entities[0].id;h.execute(new ScaleEntitiesCommand([id],{x:0,y:0,z:5},2),d);assert.equal(d.entities[0].geometry.start.z,5);h.undo(d);
 h.execute(new GripEditCommand(id,'start',{x:4,y:2}),d);assert.equal(P.parse(W.writeBytes(d)).entities[0].geometry.start.z,5);
});
test('Real native spatial index updates; untouched render primitives retain identity',()=>{
 const text=wrap([...line,...line.map((v,i)=>i===3?'A2':i===7?'20':i===13?'30':v)]),d=P.parse(text),h=new CommandHistory(),r=R.buildRenderModel(d),ix=new DxfSpatialIndex();ix.loadFromDocument(d);
 const untouched=r.getPrimitivesForEntity(d.entities[1].id)[0],id=d.entities[0].id;
 IncrementalUpdater.reconcile(h.execute(new MoveEntitiesCommand([id],100,0),d),r,ix,d);
 assert.equal(r.getPrimitivesForEntity(d.entities[1].id)[0],untouched);assert.deepEqual(ix.searchPoint(100,0,0.1),[id]);assert.ok(!ix.searchPoint(0,0,0.1).includes(id));
});
test('Native LW Move in Z changes elevation without adding a per-vertex field rejected by Save',()=>{
 const text=wrap(['0','LWPOLYLINE','5','A1','90','2','38','5','10','0','20','0','10','2','20','0']),d=P.parse(text),h=new CommandHistory();
 h.execute(new MoveEntitiesCommand([d.entities[0].id],2,3,1),d);const next=P.parse(W.writeBytes(d));assert.equal(next.entities[0].geometry.elevation,6);assert.equal(next.entities[0].geometry.vertices[0].x,2);assert.ok(!('z' in d.entities[0].geometry.vertices[0]));h.undo(d);assert.equal(W.write(d),text);
});
test('The core text-grip command also preserves native aligned anchors and omitted Z',()=>{
 const text=wrap(['0','TEXT','5','A1','10','10','20','20','30','5','11','15','21','25','31','5','72','1','40','2','1','Aligned']),d=P.parse(text),h=new CommandHistory();
 h.execute(new GripEditCommand(d.entities[0].id,'insertion',{x:25,y:35}),d);const next=P.parse(W.writeBytes(d)).entities[0];assert.equal(next.geometry.insertionPoint.x,20);assert.equal(next.geometry.alignmentPoint.x,25);assert.equal(next.geometry.insertionPoint.z,5);h.undo(d);assert.equal(W.write(d),text);
});
