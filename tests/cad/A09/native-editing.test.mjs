import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DxfDocumentParser as P} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfDocumentWriter as W} from '../../../formats/dxf/writer/dxf-document-writer.js';
import {CommandHistory,CopyEntitiesCommand,DeleteEntitiesCommand,TrimEntitiesCommand,ExtendEntitiesCommand,OffsetCommand,ExplodeCommand,JoinCommand,FilletCommand} from '../../../core/commands/cad/index.js';
const wrap=tags=>['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$HANDSEED','5','FF','0','ENDSEC','0','SECTION','2','ENTITIES',...tags,'0','ENDSEC','0','EOF'].join('\n');
const line=(handle,a,b,z=5)=>['0','LINE','5',handle,'8','0','10',a[0],'20',a[1],'30',z,'11',b[0],'21',b[1],'31',z];
function reversible(input,create,inspect) {
 const d=P.parse(input),h=new CommandHistory();assert.equal(d.readOnly,false);
 const cs=h.execute(create(d),d),output=W.writeBytes(d),ids=d.entities.map(e=>e.id),handles=d.entities.map(e=>e.handle);
 inspect?.(P.parse(output),d,cs);h.undo(d);assert.equal(W.write(d),input);h.redo(d);assert.deepEqual(W.writeBytes(d),output);assert.deepEqual(d.entities.map(e=>e.id),ids);assert.deepEqual(d.entities.map(e=>e.handle),handles);
 h.undo(d);assert.equal(W.write(d),input);return {d,h};
}
test('Native middle Trim commits two records, keeps Z/XDATA and Redo identity',()=>{
 const input=wrap([...line('A1',[0,0],[100,0]),'1001','APP','1000','opaque',...line('A2',[30,-10],[30,10]),...line('A3',[70,-10],[70,10])]);
 reversible(input,d=>new TrimEntitiesCommand({entityId:d.entities[0].id,cuttingEdgeIds:d.entities.slice(1).map(e=>e.id),clickPoint:{x:50,y:0}}),next=>{
   assert.equal(next.entities[0].geometry.end.x,30);assert.equal(next.entities[3].geometry.start.x,70);assert.equal(next.entities[3].geometry.start.z,5);assert.ok(next.entities[3].source.rawTags.some(t=>t.value==='opaque'));
 });
});
test('Native circle Trim Save writes ARC; Undo restores exact CIRCLE bytes',()=>{
 const input=wrap(['0','CIRCLE','5','A1','8','0','10','0','20','0','30','5','40','10','1001','APP','1000','opaque',...line('A2',[-20,0],[20,0])]);
 reversible(input,d=>new TrimEntitiesCommand({entityId:d.entities[0].id,cuttingEdgeIds:[d.entities[1].id],clickPoint:{x:0,y:10}}),next=>{assert.equal(next.entities[0].type,'ARC');assert.equal(next.entities[0].geometry.center.z,5);assert.ok(next.entities[0].source.rawTags.some(t=>t.value==='opaque'));});
});
test('Native Extend persists the selected endpoint in its original plane',()=>{
 reversible(wrap([...line('A1',[0,0],[10,0]),...line('A2',[20,-5],[20,5])]),d=>new ExtendEntitiesCommand({entityId:d.entities[0].id,boundaryEdgeIds:[d.entities[1].id],pickPoint:{x:10,y:0}}),next=>{assert.equal(next.entities[0].geometry.end.x,20);assert.equal(next.entities[0].geometry.end.z,5);});
});
test('Native Offset commits a handle and preserves opaque payload/Z through Redo',()=>{
 reversible(wrap([...line('A1',[0,0],[10,0]),'1001','APP','1000','opaque']),d=>new OffsetCommand({entityId:d.entities[0].id,distance:2,sidePoint:{x:0,y:10}}),next=>{assert.equal(next.entities[1].geometry.start.y,2);assert.equal(next.entities[1].geometry.start.z,5);assert.ok(next.entities[1].source.rawTags.some(t=>t.value==='opaque'));});
});
test('Native Fillet generated arc and endpoints remain at Z=5 through Save and replay',()=>{
 reversible(wrap([...line('A1',[10,0],[0,0]),...line('A2',[0,0],[0,10])]),d=>new FilletCommand({entity1Id:d.entities[0].id,entity2Id:d.entities[1].id,radius:2}),next=>{assert.equal(next.entities[2].type,'ARC');assert.equal(next.entities[2].geometry.center.z,5);assert.equal(next.entities[0].geometry.end.x,2);assert.equal(next.entities[1].geometry.start.y,2);});
});
test('Native Join grows both ends and keeps elevation; repeated Undo/Redo retains ordering',()=>{
 reversible(wrap([...line('A1',[10,0],[20,0]),...line('A2',[0,0],[10,0]),...line('A3',[20,0],[30,0])]),d=>new JoinCommand(d.entities.map(e=>e.id)),next=>{assert.equal(next.entities.length,1);assert.equal(next.entities[0].geometry.elevation,5);assert.equal(next.entities[0].geometry.vertices.length,4);});
});
test('Native bulged polyline Explode retains analytic arc and plane, without handle allocation on Save',()=>{
 reversible(wrap(['0','LWPOLYLINE','5','A1','8','0','90','2','38','5','10','0','20','0','42','1','10','2','20','0']),d=>new ExplodeCommand([d.entities[0].id]),(next,d)=>{
   assert.equal(next.entities[0].type,'ARC');assert.equal(next.entities[0].geometry.center.y,0);assert.equal(next.entities[0].geometry.center.z,5);const seed=d.handles.handseed;W.writeBytes(d);assert.equal(d.handles.handseed,seed);
 });
});
const blockInsert=extra=>wrap(['0','INSERT','5','A1','8','0','2','B','10','100','20','0','30','5',...extra]).replace('0\nSECTION\n2\nENTITIES',[
 '0','SECTION','2','BLOCKS','0','BLOCK','5','B1','2','B','70','0','10','0','20','0','30','0',
 '0','LWPOLYLINE','5','B2','8','0','90','2','10','0','20','0','40','0.1','41','0.2','42','1','10','2','20','0',
 '0','ENDBLK','5','B3','0','ENDSEC','0','SECTION','2','ENTITIES'].join('\n'));
test('Native INSERT Explode retains child bulge and scaled widths in Save/replay',()=>{
 reversible(blockInsert(['41','2','42','2','43','1']),d=>new ExplodeCommand([d.entities[0].id]),next=>{
   const e=next.entities[0];assert.equal(e.type,'LWPOLYLINE');assert.equal(e.geometry.vertices[0].x,100);assert.equal(e.geometry.vertices[1].x,104);assert.equal(e.geometry.vertices[0].bulge,1);assert.equal(e.geometry.vertices[0].startWidth,0.2);assert.equal(e.geometry.vertices[0].endWidth,0.4);assert.equal(e.geometry.elevation,5);
 });
});
test('Native nonuniform, mirrored and MINSERT Explode reject atomically',()=>{
 for(const fields of [['41','2','42','1'],['41','-1','42','-1'],['70','2','44','10']]) {
   const input=blockInsert(fields),d=P.parse(input),h=new CommandHistory();assert.throws(()=>h.execute(new ExplodeCommand([d.entities[0].id]),d));assert.equal(W.write(d),input);assert.equal(h.undoCount,0);
 }
});
test('Native LW Copy preserves opaque tokens and independent geometry without circular JSON cloning',()=>{
 reversible(wrap(['0','LWPOLYLINE','5','A1','8','0','90','2','38','5','10','0','20','0','42','1','10','2','20','0','1001','APP','1000','opaque']),d=>new CopyEntitiesCommand([d.entities[0].id],10,0),(next,d)=>{
   assert.equal(next.entities[1].geometry.vertices[0].x,10);assert.equal(next.entities[1].geometry.vertices[0].bulge,1);assert.equal(d.entities[0].geometry.vertices[0].x,0);
 });
});
test('Unsupported curved Offset and disconnected/branched Join leave exact bytes/history untouched',()=>{
 const inputs=[wrap(['0','LWPOLYLINE','5','A1','90','2','10','0','20','0','42','1','10','2','20','0']),wrap([...line('A1',[0,0],[1,0]),...line('A2',[5,0],[6,0])]),wrap([...line('A1',[0,0],[1,0]),...line('A2',[1,0],[2,0]),...line('A3',[1,0],[1,1])])];
 for(const input of inputs){const d=P.parse(input),h=new CommandHistory(),cmd=d.entities[0].type==='LWPOLYLINE'?new OffsetCommand({entityId:d.entities[0].id,distance:1,sidePoint:{x:0,y:4}}):new JoinCommand(d.entities.map(e=>e.id));assert.throws(()=>h.execute(cmd,d));assert.equal(W.write(d),input);assert.equal(h.undoCount,0);assert.equal(d.revision,0);}
});
test('Noncoplanar Fillet rejects before changing source or allocating handles',()=>{
 const input=wrap([...line('A1',[10,0],[0,0],5),...line('A2',[0,0],[0,10],6)]),d=P.parse(input),h=new CommandHistory(),seed=d.handles.handseed;
 assert.throws(()=>h.execute(new FilletCommand({entity1Id:d.entities[0].id,entity2Id:d.entities[1].id,radius:2}),d),/coplanar/);assert.equal(W.write(d),input);assert.equal(d.handles.handseed,seed);
});
test('Known external object associations block Delete before transaction commit',()=>{
 const input=wrap(line('A1',[0,0],[10,0])).replace('0\nEOF','0\nSECTION\n2\nOBJECTS\n0\nACME\n5\nB1\n330\nA1\n0\nENDSEC\n0\nEOF'),d=P.parse(input),h=new CommandHistory();
 assert.throws(()=>h.execute(new DeleteEntitiesCommand([d.entities[0].id]),d),/association/);assert.equal(W.write(d),input);assert.equal(h.undoCount,0);
});
test('Undo past a delivered Save is dirty; Redo returns to its acknowledged content checkpoint',async()=>{
 const d=P.parse(wrap(line('A1',[0,0],[10,0]))),h=new CommandHistory();h.execute(new OffsetCommand({entityId:d.entities[0].id,distance:2,sidePoint:{x:0,y:10}}),d);
 const result=await W.serialize(d,{mode:'native-save',targetFormat:'dxf',documentId:d.id,revision:d.revision,contentStateId:d.contentStateId,encodingPolicy:'preserve'});d.acknowledgeSave(result,true);assert.equal(d.dirty,false);h.undo(d);assert.equal(d.dirty,true);h.redo(d);assert.equal(d.dirty,false);
});
