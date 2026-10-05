import test from 'node:test';
import assert from 'node:assert/strict';
import { TextCodec, MtextCodec } from '../../../formats/dxf/parser/entity-codecs/text-codec.js';
import { layoutTextEntity,layoutMTextEntity,projectAnnotation,createDefaultGlyphProvider } from '../../../formats/dxf/render/annotations/index.js';
const tag=(code,value)=>({code,value:String(value)});
test('Native-codec text mirror flags and MTEXT width reach annotation consumers',()=>{
  const text=TextCodec.decode([tag(1,'A'),tag(40,10),tag(71,6)],0);
  assert.equal(layoutTextEntity(text).mirrorY,true);
  const mt=MtextCodec.decode([tag(1,'A A A'),tag(40,10),tag(41,8)],0);
  assert.equal(layoutMTextEntity(mt).referenceWidth,8);
  assert.ok(layoutMTextEntity(mt).lines.length>1);
});
test('Native MTEXT last orientation input wins without mutation',()=>{
  const tags=[tag(1,'A'),tag(40,10),tag(11,1),tag(21,0),tag(31,0),tag(50,Math.PI/2)];
  const entity=MtextCodec.decode(tags,0);entity.id='orientation';
  const before=JSON.stringify(entity);
  const p=projectAnnotation(entity,{});
  assert.ok(Math.abs(p.xAxis.x)<1e-8);assert.ok(Math.abs(p.xAxis.y-1)<1e-8);
  assert.equal(JSON.stringify(entity),before);
});
test('Glyph cache retains independent metrics across font files and returned array edits',()=>{
  const g=createDefaultGlyphProvider({maxCacheSize:2});
  const mono=g.measureText('A',{height:10,fontFile:'txt.shx'});
  const prop=g.measureText('A',{height:10,fontFile:'simplex.shx'});
  assert.equal(mono.width,6);assert.equal(prop.width,7);
  prop.charWidths.length=0;prop.width=0;
  assert.equal(g.measureText('A',{height:10,fontFile:'simplex.shx'}).charWidths.length,1);
});
test('TEXT literals are preserved and heuristic metrics cannot claim verified glyph fidelity',()=>{
  const e={id:'literal',type:'TEXT',attributes:{text:'{A}\\P',height:10},geometry:{point:{x:0,y:0}}};
  const p=projectAnnotation(e,{});assert.equal(p.text,'{A}\\P');assert.equal(p.approximate,true);
  assert.equal(p.coverage.fontResourceVerified,false);
});
