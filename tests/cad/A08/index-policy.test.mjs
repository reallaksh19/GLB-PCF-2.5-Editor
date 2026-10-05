import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialIndex2D} from '../../../core/spatial/spatial-index-2d.js';
import {DxfSpatialIndex} from '../../../formats/dxf/spatial/dxf-spatial-index.js';
import {DxfDocument} from '../../../formats/dxf/model/dxf-document.js';
import {DxfEntity} from '../../../formats/dxf/model/dxf-entity.js';
import {DxfLayer} from '../../../formats/dxf/model/dxf-layer.js';
import {DxfBlock} from '../../../formats/dxf/model/dxf-block.js';
import {DxfDocumentParser as Parser} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfDocumentWriter as Writer} from '../../../formats/dxf/writer/dxf-document-writer.js';
const p=(x,y,z=0)=>({x,y,z}),box=(x,y)=>({minX:x,minY:y,maxX:x+1,maxY:y+1});
test('deep dynamic splits and subsequent bulk load preserve every record and search',()=>{
  const index=new SpatialIndex2D(4),items=Array.from({length:1000},(_,i)=>({id:String(i),...box((i*37)%101,(i*43)%97)}));
  for(const item of items.slice(0,800))index.insert(item);
  index.load(items.slice(800));assert.equal(index.size,1000);assert.equal(index.all().length,1000);
  assert.deepEqual(new Set(index.all().map(i=>i.id)),new Set(items.map(i=>i.id)));
  const q={minX:20,minY:30,maxX:60,maxY:70};
  const oracle=items.filter(i=>i.minX<=q.maxX&&i.maxX>=q.minX&&i.minY<=q.maxY&&i.maxY>=q.minY);
  assert.deepEqual(new Set(index.search(q).map(i=>i.id)),new Set(oracle.map(i=>i.id)));
});
test('geometry ranking chooses the closest line, rather than the first AABB',()=>{
  const d=new DxfDocument();
  d.addEntity(new DxfEntity({type:'LINE',geometry:{start:p(0,0),end:p(10,10)}}));
  d.addEntity(new DxfEntity({type:'LINE',geometry:{start:p(0,5),end:p(10,5)}}));
  const i=new DxfSpatialIndex();i.loadFromDocument(d);assert.equal(i.searchPoint(1,5,5)[0],d.entities[1].id);
});
test('conic intersection rejects an empty center and accepts a tangent edge',()=>{
  const d=new DxfDocument();const e=new DxfEntity({type:'CIRCLE',geometry:{center:p(0,0),radius:10}});d.addEntity(e);
  const i=new DxfSpatialIndex();i.loadFromDocument(d);
  assert.deepEqual(i.searchPoint(0,0,.1),[]);
  assert.deepEqual(i.searchCrossing({minX:10,minY:-1,maxX:11,maxY:1}),[e.id]);
  assert.deepEqual(i.searchCrossing({minX:8,minY:8,maxX:9,maxY:9}),[]);
});
test('nonuniform rotated nested occurrences refine source conics and preserve root identity',()=>{
  const d=new DxfDocument();d.addBlock(new DxfBlock({name:'B',entities:[new DxfEntity({type:'CIRCLE',geometry:{center:p(0,0),radius:1}})]}));
  const e=new DxfEntity({type:'INSERT',geometry:{insertionPoint:p(100,200),scale:p(2,1,1),rotation:90},attributes:{blockName:'B'}});d.addEntity(e);
  const i=new DxfSpatialIndex();i.loadFromDocument(d);assert.deepEqual(i.searchPoint(100,202,.001),[e.id]);assert.deepEqual(i.searchPoint(100,200,.01),[]);
  const b=i.getEntityBounds(e.id);assert.ok(Math.abs(b.min.x-99)<1e-8 && Math.abs(b.max.y-202)<1e-8);
});
test('query policy handles live layer state, deleted records, paper space and explicit hidden access',()=>{
  const d=new DxfDocument();d.addLayer(new DxfLayer({name:'L'}));
  const e=new DxfEntity({type:'LINE',layerId:'L',geometry:{start:p(0,0),end:p(10,0)}});d.addEntity(e);
  const paper=new DxfEntity({type:'LINE',space:'paper',geometry:{start:p(0,1),end:p(10,1)}});d.addEntity(paper);
  const i=new DxfSpatialIndex();i.loadFromDocument(d);assert.equal(i.size,2);
  assert.deepEqual(i.searchPoint(5,1,.01),[]);assert.deepEqual(i.searchPoint(5,1,.01,{activeSpace:'paper'}),[paper.id]);
  d.setLayerVisibility('L',false);assert.deepEqual(i.searchPoint(5,0,.01),[]);assert.deepEqual(i.searchPoint(5,0,.01,{includeHidden:true}),[e.id]);
  e.markDeleted();assert.deepEqual(i.searchPoint(5,0,.01,{includeHidden:true}),[]);
});
test('hidden block children retain census bounds but are excluded from picks',()=>{
  const d=new DxfDocument();d.addLayer(new DxfLayer({name:'OFF',off:true}));
  d.addBlock(new DxfBlock({name:'B',entities:[new DxfEntity({type:'LINE',layerId:'OFF',geometry:{start:p(100,0),end:p(110,0)}})]}));
  const e=new DxfEntity({type:'INSERT',geometry:{insertionPoint:p(0,0)},attributes:{blockName:'B'}});d.addEntity(e);
  const i=new DxfSpatialIndex();i.loadFromDocument(d);assert.ok(i.getEntityBounds(e.id));assert.deepEqual(i.searchPoint(105,0,.01),[]);
  assert.deepEqual(i.searchPoint(105,0,.01,{includeHidden:true}),[e.id]);
});
test('layer off/frozen/locked bits and untouched opaque data survive Save and reopen',()=>{
  const input='0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n5\nA\n2\nL\n70\n16\n62\n1\n6\nCONTINUOUS\n1001\nAPP\n1000\nOPAQUE\n0\nENDTAB\n0\nENDSEC\n0\nEOF\n';
  const d=Parser.parse(input);assert.equal(Writer.write(d),input);d.setLayerVisibility('L',false);d.setLayerFrozen('L',true);d.setLayerLocked('L',true);
  const output=Writer.write(d),r=Parser.parse(output);assert.equal(r.getLayer('L').flags,21);assert.equal(r.getLayer('L').off,true);
  assert.ok(output.includes('1000\nOPAQUE\n'));d.setLayerFrozen('L',false);d.setLayerLocked('L',false);assert.equal(d.getLayer('L').flags,16);
});
