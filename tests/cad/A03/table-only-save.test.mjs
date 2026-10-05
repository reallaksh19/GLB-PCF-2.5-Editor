import test from 'node:test';
import assert from 'node:assert/strict';
import {DxfDocumentParser as Parser} from '../../../formats/dxf/parser/dxf-document-parser.js';
import {DxfDocumentWriter as Writer} from '../../../formats/dxf/writer/dxf-document-writer.js';
import {DxfEntity} from '../../../formats/dxf/model/dxf-entity.js';
const source='0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n5\nA\n2\nL\n70\n0\n62\n1\n6\nCONTINUOUS\n1001\nAPP\n1000\nOPAQUE\n0\nENDTAB\n0\nENDSEC\n0\nEOF\n';
test('table-only no-op and native layer mutation preserve bytes without ENTITIES',()=>{
  const d=Parser.parse(source);assert.equal(Writer.write(d),source);
  d.getLayer('L').off=true;const output=Writer.write(d);
  assert.equal(Parser.parse(output).getLayer('L').off,true);
  assert.equal(output,source.replace('62\n1\n','62\n-1\n'));
});
test('creation without an ENTITIES insertion boundary rejects explicitly',()=>{
  const d=Parser.parse(source),handle=d.handles.allocate();
  d.addEntity(new DxfEntity({handle,id:d.id+':created:1',type:'LINE',geometry:{start:{x:0,y:0,z:0},end:{x:1,y:0,z:0}},state:{generated:true}}));
  assert.throws(()=>Writer.write(d),/absent native ENTITIES/);
});
