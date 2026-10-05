import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DxfDocumentParser as P} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfDocumentWriter as W} from '../../../formats/dxf/writer/dxf-document-writer.js';
import {DxfSpatialIndex} from '../../../formats/dxf/spatial/dxf-spatial-index.js';
import {CadSnapService} from '../../../core/geometry/cad-snaps.js';
import {CadGeometry2D} from '../../../core/geometry/cad-geometry-2d.js';
import {GripManager} from '../../../core/grips/grip-manager.js';
import {CommandHistory} from '../../../core/commands/cad/command-history.js';
const wrap=tags=>['0','SECTION','2','ENTITIES',...tags,'0','ENDSEC','0','EOF'].join('\n');
const line=(handle,a,b,z=5)=>['0','LINE','5',handle,'8','0','10',a[0],'20',a[1],'30',z,'11',b[0],'21',b[1],'31',z];
const gm=new GripManager(),snap=new CadSnapService();
for(const type of ['TEXT','MTEXT','INSERT'])test('Native '+type+' grip Save changes insertion anchor; repeated history restores exact opaque bytes',()=>{
 const tags=['0',type,'5','A1','8','0','10','100','20','100','30','5',...(type==='INSERT'?['2','B']:['40','1','1','AB']),'1001','APP','1000','opaque'];
 const input=wrap(tags),d=P.parse(input),h=new CommandHistory(),e=d.entities[0],grip=gm.extractEntityGrips(e)[0];assert.equal(grip.point.x,100);
 h.execute(gm.createGripEditCommand(grip,{x:120,y:130}),d);const output=W.writeBytes(d),next=P.parse(output);
 assert.equal(next.entities[0].geometry.insertionPoint.x,120);assert.equal(next.entities[0].geometry.insertionPoint.z,5);assert.ok(next.entities[0].source.rawTags.some(t=>t.value==='opaque'));
 h.undo(d);assert.equal(W.write(d),input);h.redo(d);assert.deepEqual(W.writeBytes(d),output);h.undo(d);assert.equal(W.write(d),input);
});
test('Aligned native TEXT moves both insertion and alignment fields by the same delta',()=>{
 const input=wrap(['0','TEXT','5','A1','10','10','20','20','30','5','11','15','21','25','31','5','72','1','40','2','1','Aligned']),d=P.parse(input),h=new CommandHistory(),e=d.entities[0];
 const grip=gm.extractEntityGrips(e)[0];assert.equal(grip.point.x,15);h.execute(gm.createGripEditCommand(grip,{x:25,y:35}),d);
 const next=P.parse(W.writeBytes(d)).entities[0];assert.equal(next.geometry.insertionPoint.x,20);assert.equal(next.geometry.alignmentPoint.x,25);assert.equal(next.attributes.horizJust,1);h.undo(d);assert.equal(W.write(d),input);
});
test('Parsed closed polyline has closing MID/NEA in its source elevation',()=>{
 const d=P.parse(wrap(['0','LWPOLYLINE','5','A1','70','1','90','3','38','5','10','0','20','0','10','10','20','0','10','10','20','10'])),e=d.entities[0];
 const mids=gm.extractEntityGrips(e).filter(g=>g.role==='MID');assert.equal(mids.length,3);assert.equal(mids[2].point.z,5);
 const point=snap.calculateNearestPoint(e,{x:5,y:5});assert.deepEqual(point,{x:5,y:5,z:5});
 const ix=new DxfSpatialIndex();ix.loadFromDocument(d);const found=snap.snap({document:d,spatialIndex:ix,cursorPoint:{x:5,y:5},tolerance:0.01,activeModes:['MID']});assert.equal(found.entityId,e.id);assert.equal(found.point.z,5);
});
test('Native bulge MID follows the arc at source Z, rather than its chord',()=>{
 const d=P.parse(wrap(['0','LWPOLYLINE','5','A1','90','2','38','5','10','0','20','0','42','1','10','2','20','0'])),e=d.entities[0],point=gm.extractEntityGrips(e).find(g=>g.role==='MID').point;
 assert.ok(Math.abs(point.x-1)<1e-10);assert.ok(Math.abs(point.y+1)<1e-10);assert.equal(point.z,5);assert.ok(Math.abs(snap.calculateNearestPoint(e,{x:1,y:-2}).y+1)<1e-10);
});
test('Signed minor and major bulge mids agree with independently calculated sagitta',()=>{
 for(const b of [0.5,-0.5,2,-2]) {
   const d=P.parse(wrap(['0','LWPOLYLINE','5','A1','90','2','38','5','10','0','20','0','42',b,'10','2','20','0'])),point=gm.extractEntityGrips(d.entities[0]).find(g=>g.role==='MID').point;
   assert.ok(Math.abs(point.x-1)<1e-9);assert.ok(Math.abs(point.y+b)<1e-9);assert.equal(point.z,5);
 }
});
test('Native grip edits retain polyline bulge/width and source elevation through Save/Undo',()=>{
 const input=wrap(['0','LWPOLYLINE','5','A1','90','2','38','5','10','0','20','0','40','0.1','41','0.2','42','1','10','2','20','0']),d=P.parse(input),h=new CommandHistory(),e=d.entities[0],grip=gm.extractEntityGrips(e).find(g=>g.role==='VERTEX' && g.vertexIndex===0);
 h.execute(gm.createGripEditCommand(grip,{x:-1,y:0}),d);const next=P.parse(W.writeBytes(d)).entities[0];assert.equal(next.geometry.vertices[0].bulge,1);assert.equal(next.geometry.vertices[0].startWidth,0.1);assert.equal(next.geometry.elevation,5);h.undo(d);assert.equal(W.write(d),input);
 assert.throws(()=>h.execute(gm.createGripEditCommand(grip,{x:-1,y:0,z:7}),d),/elevation/);assert.equal(W.write(d),input);
});
test('Native POLYLINE VERTEX grip keeps child source view consistent and Save exact on Undo',()=>{
 const input=wrap(['0','POLYLINE','5','A1','66','1','30','5','70','0','0','VERTEX','5','A2','10','1','20','2','30','0','0','VERTEX','5','A3','10','3','20','4','30','0','0','SEQEND','5','A4']),d=P.parse(input),h=new CommandHistory(),e=d.entities[0],grip=gm.extractEntityGrips(e).find(g=>g.role==='VERTEX');
 h.execute(gm.createGripEditCommand(grip,{x:8,y:9}),d);assert.equal(e.attributes.subEntities[0].geometry.point.x,8);assert.equal(P.parse(W.writeBytes(d)).entities[0].geometry.vertices[0].x,8);h.undo(d);assert.equal(W.write(d),input);
});
test('Real index snap and kernel intersections preserve Z and reject cross-plane contacts',()=>{
 const d=P.parse(wrap([...line('A1',[-1,0],[1,0]),...line('A2',[0,-1],[0,1])])),ix=new DxfSpatialIndex();ix.loadFromDocument(d);
 const found=snap.snap({document:d,spatialIndex:ix,cursorPoint:{x:0,y:0},tolerance:0.01,activeModes:['INT']});assert.equal(found.point.z,5);assert.equal(CadGeometry2D.intersect(...d.entities)[0].z,5);
 d.entities[1].geometry.start.z=6;d.entities[1].geometry.end.z=6;assert.equal(snap.snap({document:d,spatialIndex:ix,cursorPoint:{x:0,y:0},tolerance:0.01,activeModes:['INT']}),null);assert.deepEqual(CadGeometry2D.intersect(...d.entities),[]);
});
test('Query-time native policies exclude hidden/frozen/deleted/paper and explicitly editable locked sources',()=>{
 const input=wrap([...line('A1',[0,0],[10,0]),...line('A2',[20,0],[30,0])]).replace('0\nSECTION\n2\nENTITIES','0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n5\nB1\n2\n0\n70\n0\n62\n7\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES');
 const d=P.parse(input),ix=new DxfSpatialIndex();ix.loadFromDocument(d);const args={document:d,spatialIndex:ix,cursorPoint:{x:0,y:0},tolerance:0.01,activeModes:['END']};assert.ok(snap.snap(args));
 d.setLayerVisibility('0',false);assert.equal(snap.snap(args),null);d.setLayerVisibility('0',true);d.setLayerFrozen('0',true);assert.equal(snap.snap(args),null);d.setLayerFrozen('0',false);
 d.setLayerLocked('0',true);assert.ok(snap.snap(args));assert.equal(snap.snap({...args,policy:{editableOnly:true}}),null);assert.equal(new GripManager().updateGripsForEntities(d.entities,d).length,0);d.setLayerLocked('0',false);
 d.entities[0].space='paper';assert.equal(snap.snap(args),null);d.entities[0].space='model';d.entities[0].markDeleted();assert.equal(snap.snap(args),null);
});
test('Indexed snaps use bounded source lookup even when document iteration is forbidden',()=>{
 const d=P.parse(wrap(line('A1',[0,0],[10,0]))),ix=new DxfSpatialIndex();ix.loadFromDocument(d);d.entities=new Proxy(d.entities,{get(target,key){if(['filter',Symbol.iterator].includes(key))throw new Error('Full source iteration');return Reflect.get(target,key);}});
 assert.equal(snap.snap({document:d,spatialIndex:ix,cursorPoint:{x:0,y:0},tolerance:0.01,activeModes:['END']}).entityId,d.entityIndex.keys().next().value);
});
test('Grip hit testing uses its point index and deterministic source feature IDs',()=>{
 const d=P.parse(wrap([...line('A2',[0,0],[10,0]),...line('A1',[0,0],[0,10])])),manager=new GripManager();manager.updateGripsForEntities(d.entities,d);
 const expected=[...manager.activeGrips.values()].filter(g=>g.point.x===0 && g.point.y===0).map(g=>g.id).sort()[0];manager.activeGrips.values=()=>{throw new Error('Linear grip scan');};assert.equal(manager.findGripAt({x:0,y:0},0).id,expected);
});
test('Non-finite apertures and grip targets reject; unsupported tilted bases return no false snaps',()=>{
 const d=P.parse(wrap(line('A1',[0,0],[10,0]))),e=d.entities[0],h=new CommandHistory(),grip=gm.extractEntityGrips(e)[0];
 for(const target of [{x:NaN,y:0},{x:0,y:Infinity},{x:0,y:0,z:Infinity}])assert.throws(()=>h.execute(gm.createGripEditCommand(grip,target),d));assert.equal(h.undoCount,0);
 assert.throws(()=>snap.snap({entities:d.entities,cursorPoint:{x:0,y:0},tolerance:NaN}),/aperture/);e.geometry.extrusion={x:0,y:1,z:0};assert.equal(snap.snap({entities:d.entities,cursorPoint:{x:0,y:0},tolerance:1,activeModes:['END']}),null);assert.deepEqual(gm.extractEntityGrips(e),[]);
});
