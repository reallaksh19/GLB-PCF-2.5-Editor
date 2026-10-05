import { nativeTags } from '../parser/dxf-source-index.js';
import { encodeDxfText } from './dxf-encoding.js';
import { semantic, same, encodeValue } from './dxf-field-overlays.js';

export function resourceOverlays(before, doc, stream, newline, patches, created) {
  if (doc.source.acadVersion!==before.source.acadVersion || doc.source.encoding!==before.source.encoding || doc.source.newline!==before.source.newline) throw new Error('Unsupported implicit source conversion');
  const old=resourceView(before), next=resourceView(doc);
  old.header=next.header;old.units=next.units;old.layers=next.layers;
  if(!same(old,next))throw new Error('Unsupported resource topology/reference edit needs an explicit resource plan');
  for(let i=0;i<before.layerRecords.length;i++) {
    const a=before.layerRecords[i], b=doc.layerRecords[i];
    if(!b || a.id!==b.id)throw new Error('Unsupported layer topology change');
    const expected=semantic(a);
    const flags=(b.flags & ~5)|(b.frozen?1:0)|(b.locked?4:0);
    const color=b.off?-Math.abs(b.colorIndex):Math.abs(b.colorIndex);
    for(const [key,code,value,prior] of [['flags',70,flags,a.flags],['colorIndex',62,color,a.off?-Math.abs(a.colorIndex):a.colorIndex],
      ['lineType',6,b.lineType,a.lineType],['lineWeight',370,b.lineWeight,a.lineWeight],['trueColor',420,b.trueColor,a.trueColor]]) {
      if(value!==prior) tagPatch(a.source.rawTags,code,value);
      expected[key]=semantic(b[key]);
    }
    for(const k of ['frozen','locked','off'])expected[k]=b[k];
    if(!same(expected,b))throw new Error('Unsupported layer resource mutation');
  }
  const header=before.raw.sectionRecords.find(s=>s.name==='HEADER');
  const vars=new Map();let name;
  for(const t of header?.rawTags || []) {
    if(t.code===9){name=t.value;vars.set(name,[]);}
    else if(name && t.code!==0)vars.get(name).push(t);
  }
  const changes=new Map(doc.header);
  for(const [key,field,code] of [['$INSUNITS','insunits',70],['$MEASUREMENT','measurement',70]]) {
    if(doc.units[field]!==before.units[field])changes.set(key,[{code,value:doc.units[field]}]);
  }
  if(created.length)changes.set('$HANDSEED',[{code:5,value:doc.committedHandleSeed ?? doc.handles.handseed}]);
  for(const key of before.header.keys())if(!changes.has(key))throw new Error('Unsupported header deletion');
  for(const [key,value] of changes) {
    if(same(value,before.header.get(key)))continue;
    const tags=vars.get(key), values=Array.isArray(value)?value:[{code:tags?.[0]?.code,value}];
    if(tags) {
      if(tags.length!==values.length)throw new Error('Ambiguous header field structure');
      for(let i=0;i<tags.length;i++) {
        if(values[i].code!==tags[i].code)throw new Error('Header group-code conversion is unsupported');
        patches.push({start:tags[i].valueStart,end:tags[i].valueEnd,bytes:encodeValue(values[i].value,stream.encoding)});
      }
    } else {
      if(values.some(t=>!Number.isInteger(t.code)))throw new Error('New HEADER fields require explicit group codes');
      const text=9+newline+key+newline+values.map(t=>t.code+newline+String(t.value)+newline).join('');
      if(header) {
        const at=header.rawTags.findLast(t=>t.code===0).start;patches.push({start:at,end:at,bytes:encodeDxfText(text,stream.encoding)});
      } else {
        const at=before.raw.tokens[0]?.start || 0;patches.push({start:at,end:at,bytes:encodeDxfText('0'+newline+'SECTION'+newline+'2'+newline+'HEADER'+newline+text+'0'+newline+'ENDSEC'+newline,stream.encoding)});
      }
    }
  }
  function tagPatch(tags,code,value) {
    if(value===null || value===undefined)throw new Error('Unsupported nullable resource removal');
    const found=nativeTags(tags).filter(t=>t.code===code);
    if(found.length>1)throw new Error('Ambiguous resource field');
    if(found.length)patches.push({start:found[0].valueStart,end:found[0].valueEnd,bytes:encodeValue(value,stream.encoding)});
    else {
      const at=tags.find(t=>t.code>=1000)?.start ?? tags.at(-1).end;
      patches.push({start:at,end:at,bytes:encodeDxfText(code+newline+String(value)+newline,stream.encoding)});
    }
  }
}
function resourceView(doc) {
  const tables=Object.fromEntries(Object.entries(doc.tables).filter(([k])=>!['layers','layerTable'].includes(k)));
  return semantic({header:[...doc.header],units:doc.units,tables,layers:doc.layerRecords,
    blocks:doc.blockRecords.map(({entities,...block})=>block),objects:doc.objects,classes:doc.classes});
}
