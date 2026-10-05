import { writeEntity } from './entity-writers/index.js';
import { encodeDxfText } from './dxf-encoding.js';
import { nativeTags } from '../parser/dxf-source-index.js';
import { normalizeHandle } from '../model/dxf-handle-registry.js';

const SUBCLASS = {LINE:'AcDbLine',CIRCLE:'AcDbCircle',ARC:'AcDbCircle',POINT:'AcDbPoint',
  TEXT:'AcDbText',MTEXT:'AcDbMText',INSERT:'AcDbBlockReference',LWPOLYLINE:'AcDbPolyline',
  POLYLINE:'AcDb2dPolyline',VERTEX:'AcDb2dVertex',ATTRIB:'AcDbText',
  ELLIPSE:'AcDbEllipse',SPLINE:'AcDbSpline',SOLID:'AcDbTrace',LEADER:'AcDbLeader',DIMENSION:'AcDbDimension'};
const COMMON = new Set([0,5,105,330,8,67,410,62,420,6,370,440]);
const GEOMETRY_CODES={LINE:[10,20,30,11,21,31],CIRCLE:[10,20,30,40],ARC:[10,20,30,40,50,51],POINT:[10,20,30],
  TEXT:[10,20,30,11,21,31,1,7,40,41,50,51,71,72,73],MTEXT:[10,20,30,1,3,7,40,41,50,71,72],
  LWPOLYLINE:[10,20,38,40,41,42,43,70,90],POLYLINE:[10,20,30,40,41,66,70],VERTEX:[10,20,30,40,41,42,70],
  INSERT:[2,10,20,30,41,42,43,50,66,70,71,44,45],SPLINE:[10,20,30,11,21,31,40,41,70,71,72,73,74],
  ELLIPSE:[10,20,30,11,21,31,40,41,42],SOLID:[10,20,30,11,21,31,12,22,32,13,23,33],LEADER:[10,20,30,76]};

export function validateNativeEntity(entity, doc) {
  if (!SUBCLASS[entity.type]) throw new Error('Unsupported native record type: '+entity.type);
  if (!entity.id || entity.documentId !== doc.id) throw new Error('Invalid document-scoped generated identity');
  if (!normalizeHandle(entity.handle) || !doc.handles.has(entity.handle)) throw new Error('Generated handle must be committed by a transaction');
  if (entity.ownerHandle && !doc.handles.has(entity.ownerHandle)) throw new Error('Dangling generated owner reference');
  if (entity.layerId !== '0' && !doc.getLayer(entity.layerId)) throw new Error('Dangling generated layer reference');
  if (['INSERT','DIMENSION'].includes(entity.type) && entity.attributes.blockName && !doc.getBlock(entity.attributes.blockName)) throw new Error('Dangling generated block reference');
  checkFinite(entity.geometry); checkFinite(entity.style); checkFinite(entity.attributes);
  if (['TEXT','MTEXT','ATTRIB'].includes(entity.type) && !(entity.attributes.height > 0)) throw new Error('Required native text height missing or invalid');
  if (['CIRCLE','ARC'].includes(entity.type) && !(entity.geometry.radius > 0)) throw new Error('Invalid native radius');
  if(entity.type==='SPLINE') {
    const g=entity.geometry,n=g.controlPoints?.length??0;
    if(!Number.isInteger(g.degree) || g.degree<1 || n<=g.degree || g.knots?.length!==n+g.degree+1 ||
       g.knots.some((v,i)=>i>0 && v<g.knots[i-1]) || (g.weights?.length && g.weights.length!==n) || g.weights?.some(w=>w<=0))throw new Error('Invalid native spline knot/weight structure');
  }
}
function checkFinite(v) {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Invalid finite native record field');
  if (v && typeof v === 'object') for (const [k,x] of Object.entries(v)) if (!['source','rawTags','subEntities','attribs'].includes(k)) checkFinite(x);
}

/** Typed new records are emitted with already committed identity/sequence resources. */
export function encodeRecord(entity, doc, newline, preserveFrom = null) {
  validateNativeEntity(entity,doc);
  const version=Number(String(doc.source.acadVersion).replace('AC',''));
  const modern=Number.isFinite(version) && version >= 1012;
  const rows=[];
  const add=(code,value)=>{
    if (/[\r\n\0]/.test(String(value))) throw new Error('Invalid multiline native field');
    rows.push(code+newline+String(value)+newline);
  };
  const common=e=>{
    add(0,e.type); add(5,e.handle); if(e.ownerHandle)add(330,e.ownerHandle);
    if(modern)add(100,'AcDbEntity'); add(8,e.layerId || '0');
    if(e.space==='paper')add(67,1); if(e.layoutId)add(410,e.layoutId);
    const s=e.style || {};
    if(s.colorIndex!=null && s.colorIndex!==256)add(62,s.colorIndex);
    if(s.trueColor!=null){if(version<1018)throw new Error('Unsupported TrueColor for source version');add(420,s.trueColor);}
    if(s.lineType && s.lineType!=='BYLAYER')add(6,s.lineType);
    if(s.lineWeight!=null && s.lineWeight!==-1)add(370,s.lineWeight);
    if(s.transparency!=null)add(440,s.transparency);
    if(modern)add(100,SUBCLASS[e.type]);
  };
  const point=(p,code)=>{if(!p)throw new Error('Required native point missing');add(code,p.x);add(code+10,p.y);add(code+20,p.z??0);};
  common(entity);
  if(entity.type==='POLYLINE') {
    add(66,1);point({x:0,y:0,z:entity.geometry.elevation??0},10);
    add(70,(entity.attributes.flags & ~1)|(entity.geometry.closed?1:0));
    if(entity.geometry.startWidth)add(40,entity.geometry.startWidth);
    if(entity.geometry.endWidth)add(41,entity.geometry.endWidth);
    const children=entity.attributes.subEntities || [];
    for(let i=0;i<entity.geometry.vertices.length;i++) {
      const v=entity.geometry.vertices[i], child=children[i];
      const handle=v.handle || child?.handle;
      if(!handle || !doc.handles.has(handle))throw new Error('Missing committed VERTEX handle');
      const e={...(child || entity),type:'VERTEX',handle,ownerHandle:entity.handle};common(e);
      point(v,10);for(const [key,code] of [['startWidth',40],['endWidth',41],['bulge',42],['flags',70]])if(v[key])add(code,v[key]);
      appendOpaque(child?.source.rawTags || v.rawTags || [],'VERTEX');
    }
    seqend();
  } else if(entity.type==='ATTRIB') {
    point(entity.geometry.insertionPoint,10);add(40,entity.attributes.height);add(1,entity.attributes.text??'');
    if(modern)add(100,'AcDbAttribute');add(2,entity.attributes.tag??'');add(70,entity.attributes.flags??0);
    if(entity.attributes.rotation)add(50,entity.attributes.rotation);
    if(entity.attributes.styleName)add(7,entity.attributes.styleName);
    if(entity.geometry.alignmentPoint)point(entity.geometry.alignmentPoint,11);
  } else {
    const lines=[], synthetic={...entity,source:{rawTags:[],seqendRawTags:[]},state:{modified:true},
      attributes:{...entity.attributes,attribs:[]},geometry:{...entity.geometry}};
    if(entity.type==='LWPOLYLINE')synthetic.geometry.vertices=entity.geometry.vertices.map(v=>({...v,rawTags:[]}));
    writeEntity(synthetic,lines);
    const pairs=[];for(let i=0;i<lines.length;i+=2)pairs.push({code:Number(lines[i]),value:lines[i+1]});
    for(const t of pairs)if(!COMMON.has(t.code))add(t.code,t.value);
    if(entity.type==='SPLINE')for(const w of entity.geometry.weights || [])add(41,w);
    if(entity.geometry.extrusion && !pairs.some(t=>t.code===210)) {
      const ex=entity.geometry.extrusion;
      if(ex.x!==0 || ex.y!==0 || ex.z!==1)point(ex,210);
    }
    if(entity.type==='INSERT' && entity.attributes.attribs?.length) {
      add(66,1);
      for(const child of entity.attributes.attribs)rows.push(encodeRecord({...child,ownerHandle:entity.handle},doc,newline));
      seqend();
    }
    if(modern && entity.type==='ARC') {
      const marker=rows.findIndex(x=>typeof x==='string' && x.startsWith('50'+newline));rows.splice(marker,0,'100'+newline+'AcDbArc'+newline);
    }
  }
  const raw=preserveFrom?.source?.rawTags || entity.source?.copiedRawTags || [];
  const native=new Set(nativeTags(raw)), codes=new Set(GEOMETRY_CODES[preserveFrom?.type || entity.type] || []);
  // Opaque application groups/XDATA are copied verbatim, including original spacing/newlines.
  const opaque=[];
  for(const t of raw)if(!native.has(t) || (!COMMON.has(t.code) && t.code!==100 && !codes.has(t.code) && ![210,220,230].includes(t.code)))opaque.push(doc.tokenStream.byteSlice(t.start,t.end));
  let at=rows.findIndex((r,i)=>i>0 && ((typeof r==='string' && /^0(?:\r\n|\n|\r)/.test(r)) || (entity.type==='INSERT' && r instanceof Uint8Array)));if(at<0)at=rows.length;
  rows.splice(at,0,...opaque);
  const chunks=rows.map(r=>typeof r==='string'?encodeDxfText(r,doc.source.encoding):r);
  const output=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;
  for(const b of chunks){output.set(b,offset);offset+=b.length;}return output;
  function seqend() {
    const handle=entity.source?.seqendHandle || entity.sequenceEnd?.handle || entity.source?.seqendRawTags?.find(t=>t.code===5)?.value;
    if(!handle || !doc.handles.has(handle))throw new Error('Missing committed SEQEND handle');
    add(0,'SEQEND');add(5,handle);add(330,entity.handle);if(modern)add(100,'AcDbEntity');add(8,entity.layerId||'0');
  }
  function appendOpaque(tags,type) {
    const native=new Set(nativeTags(tags)), codes=new Set(GEOMETRY_CODES[type] || []);
    for(const t of tags)if(!native.has(t) || (!COMMON.has(t.code) && t.code!==100 && !codes.has(t.code) && ![210,220,230].includes(t.code)))rows.push(doc.tokenStream.byteSlice(t.start,t.end));
  }
}
