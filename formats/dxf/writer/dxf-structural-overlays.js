import { fieldOverlays, same } from './dxf-field-overlays.js';
import { encodeRecord } from './dxf-record-writer.js';

/** Record edits use preserved source identity, not moving array indexes. */
export function entityOverlays(before, doc, newline, patches, validateReferences) {
  const created=[],deleted=[],originalHandles=new Set(before.raw.records.map(r=>r.handle).filter(Boolean));
  const used=new Set(originalHandles);
  editList(before.entities,doc.entities,sectionEnd('ENTITIES'));
  for(let i=0;i<before.blockRecords.length;i++) {
    const block=doc.blockRecords[i];
    if(!block || block.id!==before.blockRecords[i].id)throw new Error('Unsupported BLOCK topology edit');
    const end=before.blockRecords[i].source.endBlkRawTags[0]?.start;
    editList(before.blockRecords[i].entities,block.entities,end);
  }
  validateDeletionClosure();
  return {created,deleted};

  function sectionEnd(name) {
    const sections=before.raw.sectionRecords.filter(s=>s.name===name);
    if(sections.length!==1)throw new Error('Ambiguous or absent native '+name+' section');
    return sections[0].rawTags.findLast(t=>t.code===0).start;
  }
  function editList(prior,current,end) {
    const byStart=new Map(prior.map(e=>[e.source.span?.start,e]));
    const retained=new Set();let last=-1;
    for(let i=0;i<current.length;i++) {
      const after=current[i], start=after.source.span?.start, old=byStart.get(start);
      if(after.state.deleted)continue;
      if(!old) {
        if(after.source.span)throw new Error('Unknown native source span');
        for(const h of collectHandles(after)) {
          if(!h || used.has(h))throw new Error('Duplicate or missing committed generated handle');
          used.add(h);
        }
        const next=current.slice(i+1).find(e=>e.source.span && !e.state.deleted);
        const at=next?.source.span.start ?? end;
        if(!Number.isInteger(at))throw new Error('Absent record insertion boundary');
        patches.push({start:at,end:at,bytes:encodeRecord(after,doc,newline)});created.push(after);continue;
      }
      if(start<last || retained.has(start))throw new Error('Unsupported native record reorder/duplicate');
      last=start;retained.add(start);
      const topology=['LWPOLYLINE','POLYLINE'].includes(after.type) && old.geometry.vertices?.length!==after.geometry.vertices?.length;
      const splineTopology=after.type==='SPLINE' && ['controlPoints','fitPoints','knots','weights'].some(k=>old.geometry[k]?.length!==after.geometry[k]?.length);
      if(old.type!==after.type || topology || splineTopology) {
        const span=old.source.sequenceSpan || old.source.span;
        patches.push({start:span.start,end:span.end,bytes:encodeRecord(after,doc,newline,old)});
      } else {
        if(after.state.modified || !same(old,after)) {
          validateReferences(old,after,doc);
          fieldOverlays(old,after,old.source.rawTags,before.tokenStream,newline,patches);
        }
        if(old.type==='POLYLINE')editPolyline(old,after);
        else editList(old.attributes.attribs || [],after.attributes.attribs || [],old.source.seqendRawTags?.[0]?.start);
      }
    }
    for(const old of prior)if(!retained.has(old.source.span.start)) {
      const span=old.source.sequenceSpan || old.source.span;
      patches.push({start:span.start,end:span.end,bytes:new Uint8Array()});deleted.push(old);
    }
  }
  function editPolyline(old,after) {
    const a=old.geometry.vertices,b=after.geometry.vertices;
    const children=old.attributes.subEntities || [], current=after.attributes.subEntities || [];
    if(a.length!==b.length || children.length!==current.length)throw new Error('POLYLINE topology changes require committed sequence records');
    for(let i=0;i<a.length;i++) {
      const child=children[i],existing=current[i];
      if(!child || !existing || existing.state.deleted)throw new Error('Invalid POLYLINE sequence');
      const synthetic={...existing,geometry:{...existing.geometry,point:{x:b[i].x,y:b[i].y,z:b[i].z}},attributes:{...existing.attributes,flags:b[i].flags}};
      for(const key of ['bulge','startWidth','endWidth'])synthetic.geometry[key]=b[i][key];
      if(!same(child,existing) && !same(existing,synthetic))throw new Error('Conflicting native POLYLINE/VERTEX edits');
      if(after.state.modified || existing.state.modified || !same(child,synthetic))fieldOverlays(child,synthetic,child.source.rawTags,before.tokenStream,newline,patches);
    }
  }
  function validateDeletionClosure() {
    const removed=new Set(deleted.flatMap(collectHandles));
    const spans=deleted.map(e=>e.source.sequenceSpan || e.source.span);
    for(const record of before.raw.records) {
      if(spans.some(s=>record.span.start>=s.start && record.span.end<=s.end))continue;
      for(const t of record.rawTags)if(((t.code>=330 && t.code<=369)||(t.code>=390 && t.code<=399)||t.code===1005) && removed.has(t.value.trim().toUpperCase())) {
        throw new Error('Dangling source reference prevents deletion: '+t.value);
      }
    }
  }
}
function collectHandles(e) {
  const result=e.handle?[e.handle]:[];
  for(const child of e.attributes.subEntities || e.attributes.attribs || [])result.push(...collectHandles(child));
  if(e.type==='POLYLINE')for(const v of e.geometry.vertices || [])if(v.handle && !result.includes(v.handle))result.push(v.handle);
  const end=e.source?.seqendHandle || e.sequenceEnd?.handle || e.source?.seqendRawTags?.find(t=>t.code===5)?.value;
  if(end)result.push(end.trim().toUpperCase());
  return result;
}
