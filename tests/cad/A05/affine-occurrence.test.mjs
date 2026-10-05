import test from 'node:test';
import assert from 'node:assert/strict';
import { DxfDocument } from '../../../formats/dxf/model/dxf-document.js';
import { DxfBlock } from '../../../formats/dxf/model/dxf-block.js';
import { DxfEntity } from '../../../formats/dxf/model/dxf-entity.js';
import { DxfLayer } from '../../../formats/dxf/model/dxf-layer.js';
import { DxfRenderAdapter as Adapter, resolveEntityStyle } from '../../../formats/dxf/render/index.js';
const p=(x,y,z=0)=>({x,y,z});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function blockModel(leaf, geometry={}, attributes={}) {
  const d=new DxfDocument();d.addBlock(new DxfBlock({name:'B',entities:[leaf]}));
  const root=new DxfEntity({type:'INSERT',geometry:{insertionPoint:p(0,0),...geometry},attributes:{blockName:'B',...attributes}});
  d.addEntity(root);return {d,root,model:Adapter.buildRenderModel(d)};
}
test('source bulge is sampled before nonuniform transform; elevation retained',()=>{
  const leaf=new DxfEntity({type:'LWPOLYLINE',geometry:{elevation:5,vertices:[{...p(0,0),bulge:1},p(2,0)]}});
  const {model}=blockModel(leaf,{scale:p(2,3,1)});
  near(Math.min(...model.primitives[0].points.map(p=>p.y)),-3);
  near(model.primitives[0].points.at(-1).x,4);
  assert.ok(model.primitives[0].points.every(p=>p.z===5));
});
test('nested block bases subtract in their own frames without losing shear',()=>{
  const d=new DxfDocument();
  d.addBlock(new DxfBlock({name:'INNER',basePoint:p(5,7),entities:[new DxfEntity({type:'LINE',geometry:{start:p(6,7),end:p(7,7)}})]}));
  d.addBlock(new DxfBlock({name:'OUTER',basePoint:p(10,20),entities:[new DxfEntity({type:'INSERT',geometry:{insertionPoint:p(11,20),rotation:90},attributes:{blockName:'INNER'}})]}));
  d.addEntity(new DxfEntity({type:'INSERT',geometry:{insertionPoint:p(100,200),scale:p(2,1,1)},attributes:{blockName:'OUTER'}}));
  const leaf=Adapter.buildRenderModel(d).primitives[0];near(leaf.start.x,102);near(leaf.start.y,201);near(leaf.end.y,202);
});
test('native MINSERT rows/columns give unique stable occurrences and root selection',()=>{
  const {d,root,model}=blockModel(new DxfEntity({type:'POINT',geometry:{point:p(0,0)}}),{rotation:90,scale:p(2,1,1)},{rows:2,columns:2,rowSpacing:3,columnSpacing:4});
  assert.equal(model.primitives.length,4);assert.equal(new Set(model.primitives.map(p=>p.id)).size,4);
  assert.ok(model.primitives.every(p=>p.sourceEntityId===root.id));
  assert.deepEqual(Adapter.buildRenderModel(d).primitives.map(p=>p.id),model.primitives.map(p=>p.id));
  near(model.primitives[1].position.y,4);near(model.primitives[2].position.x,-3);
});
test('mirroring preserves transformed curve points',()=>{
  const {model}=blockModel(new DxfEntity({type:'ARC',geometry:{center:p(0,0),radius:1,startAngle:0,endAngle:90}}),{scale:p(-2,1,1)});
  near(model.primitives[0].startPoint.x,-2);near(model.primitives[0].endPoint.y,1);
  assert.equal(model.primitives[0].type,'ellipse');
});
test('circle center and sampled plane use native OCS',()=>{
  const d=new DxfDocument();d.addEntity(new DxfEntity({type:'CIRCLE',geometry:{center:p(1,2,3),radius:1,extrusion:p(0,1,0)}}));
  const c=Adapter.buildRenderModel(d).primitives[0];near(c.center.x,-1);near(c.center.y,3);near(c.center.z,2);
  assert.ok(c.points.every(v=>Math.abs(v.y-3)<1e-9));
});
test('rotated nonuniform text bounds include transformed corners',()=>{
  const {model}=blockModel(new DxfEntity({type:'TEXT',geometry:{insertionPoint:p(0,0,5)},attributes:{height:1,text:'AB'}}),{insertionPoint:p(100,200),scale:p(2,3,1),rotation:90});
  const t=model.primitives[0];near(t.position.x,100);near(t.position.y,200);near(t.height,3);
  assert.ok(t.bounds.min.x<100 && t.bounds.max.x>100);assert.ok(t.bounds.min.y>=200);
  assert.equal(t.bounds.approximate,true);
});
test('native lineweight codes override an inconsistent mode string',()=>{
  const d=new DxfDocument();d.addLayer(new DxfLayer({name:'0',lineWeight:50}));
  for(const [code,expected] of [[-1,.5],[-2,.8],[-3,.25],[70,.7]]) {
    near(resolveEntityStyle(new DxfEntity({style:{lineWeight:code,lineWeightMode:'BYLAYER'}}),d,{parentLineWeight:.8}).lineWeight,expected);
  }
});
test('projection output cannot mutate source geometry',()=>{
  const d=new DxfDocument();const e=new DxfEntity({type:'DIMENSION',geometry:{defPoints:{p10:p(2,3),p13:p(4,5)}}});d.addEntity(e);
  const before=JSON.stringify(e.geometry),prim=Adapter.buildRenderModel(d).primitives[0];prim.points[0].x=999;
  assert.equal(JSON.stringify(e.geometry),before);
});
test('unsupported hatch and spline bases report explicit diagnostics',()=>{
  const d=new DxfDocument();d.addEntity(new DxfEntity({type:'HATCH'}));d.addEntity(new DxfEntity({type:'SPLINE',geometry:{fitPoints:[p(1,1),p(2,3)]}}));
  const m=Adapter.buildRenderModel(d);assert.equal(m.primitives.length,1);assert.equal(m.primitives[0].approximate,true);
  assert.deepEqual(m.diagnostics.map(d=>d.code),['HATCH_BOUNDARY_UNSUPPORTED','SPLINE_BASIS_UNSUPPORTED']);
});
