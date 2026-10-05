import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DxfDocument} from '../../../formats/dxf/model/dxf-document.js';
import {DxfEntity} from '../../../formats/dxf/model/dxf-entity.js';
import {DxfBlock} from '../../../formats/dxf/model/dxf-block.js';
import {DxfLayer} from '../../../formats/dxf/model/dxf-layer.js';
import {DxfDocumentParser as Parser} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfRenderAdapter as Adapter,sampleBulgeArc,createInsertTransform,composeTransforms,transformPoint,resolveEntityStyle} from '../../../formats/dxf/render/index.js';
const check=test;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`expected ${b}, got ${a}`);
const point=(x,y,z=0)=>({x,y,z});
function model(type,geometry,attributes={},id){const d=new DxfDocument();d.addEntity(new DxfEntity({handle:'A',id,type,geometry,attributes}));return Adapter.buildRenderModel(d);}
function blocks(leaf,roots){const d=new DxfDocument();d.addBlock(new DxfBlock({name:'B',entities:[leaf]}));for(const r of roots)d.addEntity(new DxfEntity({type:'INSERT',handle:r.handle,attributes:{blockName:'B'},geometry:{insertionPoint:r.position||point(0,0),scale:r.scale||point(1,1,1)}}));return Adapter.buildRenderModel(d);}
check('positive control: LINE world coordinates',()=>{const p=model('LINE',{start:point(5,8),end:point(7,9)}).primitives[0];near(p.start.x,5);near(p.end.y,9);});
check('positive control: uniform transformed LINE',()=>{const p=blocks(new DxfEntity({type:'LINE',handle:'L',geometry:{start:point(1,2),end:point(2,3)}}),[{handle:'I',position:point(10,20),scale:point(2,2,2)}]).primitives[0];near(p.start.x,12);near(p.start.y,24);});
check('F104-01 positive bulge must traverse CCW',()=>{const p=sampleBulgeArc(point(0,0),point(2,0),1);near(p[Math.floor(p.length/2)].y,-1);});
check('F104-01 negative bulge must traverse clockwise',()=>{const p=sampleBulgeArc(point(0,0),point(2,0),-1);near(p[Math.floor(p.length/2)].y,1);});
check('F104-02 nonuniform rotated nested transform',()=>{const parent=createInsertTransform(point(0,0),point(2,1,1));const child=createInsertTransform(point(0,0),point(1,1,1),90);const p=transformPoint(point(1,0),composeTransforms(parent,child));near(p.y,1);});
check('F104-03 nonuniform CIRCLE becomes ellipse',()=>{const m=blocks(new DxfEntity({type:'CIRCLE',handle:'C',geometry:{center:point(0,0),radius:1}}),[{handle:'I',scale:point(2,1,1)}]);near(Math.max(...m.primitives[0].points.map(p=>p.x)),2);});
check('F104-04 unique occurrence primitive IDs',()=>{const m=blocks(new DxfEntity({type:'LINE',handle:'L',geometry:{start:point(0,0),end:point(1,0)}}),[{handle:'I1'},{handle:'I2',position:point(100,0)}]);assert.equal(new Set(m.primitives.map(p=>p.id)).size,2,JSON.stringify(m.primitives.map(p=>({id:p.id,source:p.sourceEntityId}))));});
check('F104-05 transformed TEXT bounds',()=>{const m=blocks(new DxfEntity({type:'TEXT',handle:'T',geometry:{insertionPoint:point(0,0)},attributes:{text:'AB',height:1}}),[{handle:'I',position:point(100,100)}]);assert.ok(m.primitives[0].bounds.min.x>=100,`world anchor=${m.primitives[0].position.x}; bounds.min.x=${m.primitives[0].bounds.min.x}`);});
check('F104-06 parsed invisible entity',()=>{const d=Parser.parse('0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nA\n60\n1\n10\n0\n20\n0\n11\n1\n21\n0\n0\nENDSEC\n0\nEOF\n');assert.equal(Adapter.buildRenderModel(d).primitives.length,0);});
check('F104-07 BYBLOCK lineweight -2',()=>{const d=new DxfDocument();d.addLayer(new DxfLayer({name:'0',lineWeight:50}));const e=new DxfEntity({type:'LINE',style:{lineWeight:-2,lineWeightMode:'BYBLOCK'}});near(resolveEntityStyle(e,d,{inBlock:true,parentLineWeight:0.8}).lineWeight,0.8);});
check('F104-08 TEXT preserves document scoped identity',()=>{const m=model('TEXT',{insertionPoint:point(0,0)},{text:'AB',height:1},'dxf:doc:record:7');assert.equal(m.primitives[0].sourceEntityId,'dxf:doc:record:7');});
check('F104-09 rational quadratic quarter-circle SPLINE',()=>{const p=model('SPLINE',{degree:2,knots:[0,0,0,1,1,1],weights:[1,Math.SQRT1_2,1],controlPoints:[point(1,0),point(1,1),point(0,1)]}).primitives[0];const error=Math.max(...p.points.map(q=>Math.abs(Math.hypot(q.x,q.y)-1)));assert.ok(error<1e-8,`radial error=${error}`);});
