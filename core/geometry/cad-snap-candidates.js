import {sourcePlaneZ} from './cad-source-plane.js';
export function eligibleSnapEntity(entity,document,options={}) {
 if(!entity || !entity.id || entity.state?.deleted || sourcePlaneZ(entity)==null)return false;
 if(options.planeZ!=null && Math.abs(sourcePlaneZ(entity)-options.planeZ)>1e-8)return false;
 if(document?.isEntitySelectable && !document.isEntitySelectable(entity.id,options))return false;
 if(!document && !options.includePaperSpace && (entity.space || 'model')!==(options.activeSpace || 'model'))return false;
 const layer=document?.getLayer?.(entity.layerId);
 if(options.editableOnly && layer?.locked)return false;
 return options.includeHidden || !(layer?.off || layer?.frozen || entity.attributes?.invisible || Number(entity.style?.colorIndex)<0 || entity.source?.rawTags?.some(t=>t.code===60 && Number(t.value)===1));
}
/** Indexed queries resolve only returned source IDs; lookup creation belongs to the provider. */
export function snapEntities(params) {
 const index=params.spatialIndex,document=params.document || index?.document,policy=params.policy || {},entities=params.entities || document?.entities || [];
 if(!index)return entities.filter(e=>eligibleSnapEntity(e,document,policy));
 const {cursorPoint:p,tolerance:t}=params,box={minX:p.x-t,minY:p.y-t,maxX:p.x+t,maxY:p.y+t};
 const found=typeof index.search==='function' ? index.search(box) : typeof index.searchCrossing==='function' ? index.searchCrossing(box,{...policy,includeHidden:true}) : typeof index.query==='function' ? index.query(box) : null;
 if(!found)throw new Error('Unsupported snap index query port');
 const lookup=params.entityIndex || document?.entityIndex;
 const resolve=params.resolveEntity || (lookup ? id=>lookup.get(id) : null),rows=new Map();
 for(const hit of found) {
   const id=typeof hit==='string' ? hit : hit.id;
   const e=resolve ? resolve(id) : hit.entity;
   if(!e && !resolve && !hit.entity)throw new Error('Indexed snap requires a source-ID lookup port');
   if(eligibleSnapEntity(e,document,policy))rows.set(e.id,e);
 }
 return [...rows.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
