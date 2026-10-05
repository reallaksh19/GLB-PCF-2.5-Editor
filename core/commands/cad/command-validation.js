import {validateRemoval} from './native-reference-validation.js';
import {validateEditing} from './edit-commands/edit-validation.js';
/** Validate the entire source operand plan before the first mutation. */
const supported = new Set(['MOVE','ROTATE','SCALE','COPY','DELETE','CHANGE_LAYER','CHANGE_PROPERTIES','EDIT_TEXT','GRIP_EDIT','TRIM','EXTEND','OFFSET','FILLET','EXPLODE','JOIN']);
const geometric = new Set(['LINE','POINT','CIRCLE','ARC','ELLIPSE','LWPOLYLINE','POLYLINE','SPLINE','TEXT','MTEXT','ATTRIB','INSERT','SOLID','TRACE','3DFACE']);
function finite(value,seen=new Set()) {
  if(typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite command operand');
  if(value && typeof value === 'object' && !seen.has(value)) {seen.add(value);for(const [key,v] of Object.entries(value))if(!['source','rawTags','stream'].includes(key))finite(v,seen);}
}
export function validateCommand(command,document) {
  if(!document || document.readOnly) throw new Error('Editable source document required');
  if(command.commands) { for(const child of command.commands) validateCommand(child,document); return; }
  if(!supported.has(command.name) && typeof command.validateOperands !== 'function') throw new Error('Unsupported command plan');
  const ids = command.entityIds || command.sourceEntityIds || [command.entityId,command.entity1Id,command.entity2Id].filter(Boolean);
  if(new Set(ids).size !== ids.length) throw new Error('Duplicate command operands');
  const entities = ids.map(id => {
    const e=document.getEntity(id);
    if(!e || e.state.deleted || !document.entities.includes(e)) throw new Error('Missing or non-root source operand: '+id);
    const layer=document.getLayer(e.layerId);
    if(layer?.locked || layer?.frozen) throw new Error('Layer is locked or frozen');
    return e;
  });
  for(const point of [command.basePoint,command.clickPoint,command.pickPoint,command.sidePoint])if(point && (!Number.isFinite(point.x) || !Number.isFinite(point.y)))throw new Error('Finite source point required');
  for(const key of ['dx','dy','dz','angleDeg','sx','sy','sz','basePoint','newPoint','updates','properties','radius','distance','clickPoint','pickPoint','sidePoint']) finite(command[key]);
  if(['MOVE','COPY','ROTATE','SCALE'].includes(command.name)) for(const e of entities) {
    if(!geometric.has(e.type)) throw new Error('Unsupported native transform: '+e.type);
    const n=e.geometry.extrusion || e.attributes.extrusion;
    if(n && (n.x || n.y || n.z !== 1)) throw new Error('Tilted OCS transform requires a native basis conversion');
    if(command.name==='COPY' && (e.attributes.subEntities?.length || e.attributes.attribs?.length || e.source.rawTags.some(t=>[102,340,350,360].includes(t.code)))) throw new Error('Copy of an owned compound or reference closure is not supported');
    if(command.name==='SCALE') {
      if(command.sx<=0 || command.sy<=0 || command.sz<=0) throw new Error('Scale must be positive');
      if(command.sx!==command.sy && (['CIRCLE','ARC','ELLIPSE','TEXT','MTEXT','ATTRIB','INSERT'].includes(e.type) || e.geometry.vertices?.some(v=>v.bulge))) throw new Error('Unsupported nonuniform native curve or annotation scale');
    }
  }
  if(command.name==='CHANGE_LAYER') {
    const target=document.getLayer(command.targetLayer);
    if(!target || target.locked || target.frozen) throw new Error('Unavailable target layer');
  }
  if(command.name==='EDIT_TEXT') {
    if(entities.some(e=>!['TEXT','MTEXT','ATTRIB'].includes(e.type))) throw new Error('Text entity required');
    if(command.updates.height!=null && command.updates.height<=0) throw new Error('Text height must be positive');
    if(command.updates.styleName && !document.tables.textStyles.getRecord?.(command.updates.styleName)) throw new Error('Unknown text style');
  }
  if(command.name==='CHANGE_PROPERTIES') {
    const p=command.properties;
    if(p.lineType && !['BYLAYER','BYBLOCK','CONTINUOUS'].includes(p.lineType.toUpperCase()) && !document.tables.lineTypes.hasRecord(p.lineType)) throw new Error('Unknown line type');
    if(p.colorIndex!=null && (!Number.isInteger(p.colorIndex) || p.colorIndex<0 || p.colorIndex>256)) throw new Error('Invalid indexed color');
    if(p.trueColor!=null && (!Number.isInteger(p.trueColor) || p.trueColor<0 || p.trueColor>0xffffff)) throw new Error('Invalid true color');
    if(p.lineWeight!=null && (!Number.isInteger(p.lineWeight) || p.lineWeight< -3 || p.lineWeight>211)) throw new Error('Invalid line weight');
  }
  if(command.name==='GRIP_EDIT') {
    const e=entities[0],g=e.geometry,k=command.gripKey;
    const valid=e.type==='LINE' ? [0,1,'start','end'].includes(k) : ['CIRCLE','ARC'].includes(e.type) ? ['center','radius',0,1,2,3,4].includes(k) : ['LWPOLYLINE','POLYLINE'].includes(e.type) ? Number.isInteger(Number(k)) && Number(k)>=0 && Number(k)<g.vertices.length : ['POINT','TEXT','MTEXT','INSERT'].includes(e.type);
    if(!valid)throw new Error('Unsupported native grip');
    if(!Number.isFinite(command.newPoint.x) || !Number.isFinite(command.newPoint.y))throw new Error('Finite grip coordinates required');
  }
  if(['TRIM','EXTEND','OFFSET','FILLET','EXPLODE','JOIN'].includes(command.name))validateEditing(command,entities,document);
  if(['DELETE','JOIN','EXPLODE'].includes(command.name))validateRemoval(document,entities);
  command.validateOperands?.(document,entities);
}

export function validateResult(changeSet,document) {for(const id of changeSet.affectedIds){const e=document.entityIndex.get(id);if(e){finite(e.geometry);finite(e.style);}}}
