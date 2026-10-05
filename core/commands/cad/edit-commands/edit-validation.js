/** This milestone supports horizontal source planes. Other native bases reject explicitly. */
export function planeZ(entity) {
 const g=entity.geometry,n=g.extrusion;
 if(n && (n.x || n.y || n.z!==1))throw new Error('Tilted OCS edit is unsupported');
 const points=g.start ? [g.start,g.end] : g.center ? [g.center] : g.vertices?.map(p=>({...p,z:g.elevation ?? p.z ?? 0})) || [g.insertionPoint || g.point].filter(Boolean);
 const z=points[0]?.z ?? 0;
 if(points.some(p=>Math.abs((p.z ?? 0)-z)>1e-8))throw new Error('Nonplanar native edit is unsupported');
 return z;
}
function cleanClosure(e) {
 if(e.attributes.attribs?.length || e.source.rawTags.some(t=>[102,1001,1005].includes(t.code)))throw new Error('Owned or opaque edit closure requires explicit native policy');
}
export function validateEditing(command,entities,document) {
 const reads=(command.cuttingEdgeIds || command.boundaryEdgeIds || []).map(id=>{
   const e=document.getEntity(id);if(!e || e.state.deleted)throw new Error('Missing cutting/boundary source');return e;
 });
 const z=planeZ(entities[0]);
 for(const e of [...entities,...reads])if(Math.abs(planeZ(e)-z)>1e-8)throw new Error('Source operands are not coplanar');
 if(command.name==='TRIM' && !['LINE','CIRCLE'].includes(entities[0].type))throw new Error('Unsupported Trim type');
 if(command.name==='EXTEND' && (entities[0].type!=='LINE' || reads.some(e=>e.type!=='LINE')))throw new Error('Unsupported Extend boundary');
 if(command.name==='OFFSET') {
   const e=entities[0],g=e.geometry;
   if(!(command.distance>0))throw new Error('Positive offset required');
   if(!['LINE','CIRCLE','ARC','LWPOLYLINE'].includes(e.type) || g.vertices?.some(v=>v.bulge || v.startWidth || v.endWidth) || g.constantWidth)throw new Error('Curved/width polyline Offset requires explicit conversion');
   if(e.attributes.attribs?.length || e.source.rawTags.some(t=>[102,1005].includes(t.code)))throw new Error('Unsupported offset reference closure');
 }
 if(command.name==='FILLET' && (command.radius<0 || entities.length!==2 || entities.some(e=>e.type!=='LINE')))throw new Error('Fillet requires two coplanar lines and nonnegative radius');
 if(command.name==='JOIN') {
   if(entities.length<2 || entities.some(e=>!['LINE','ARC'].includes(e.type)))throw new Error('Join requires LINE/ARC operands');
   for(const e of entities) {cleanClosure(e);if(e.layerId!==entities[0].layerId || e.space!==entities[0].space || JSON.stringify(e.style)!==JSON.stringify(entities[0].style))throw new Error('Join source styles/context differ');}
 }
 if(command.name==='EXPLODE')for(const e of entities) {
   cleanClosure(e);
   if(e.type==='INSERT') {
     const g=e.geometry,s=g.scale || {x:1,y:1,z:1},block=document.getBlock(e.attributes.blockName);
     if(!block || (s.x ?? 1)!==(s.y ?? 1) || (s.x ?? 1)<=0 || (s.z ?? 1)<=0 || (e.attributes.columns || 1)>1 || (e.attributes.rows || 1)>1)throw new Error('Unsupported nonuniform/mirrored/array INSERT Explode');
     for(const child of block.entities) {planeZ(child);if(child.source.rawTags.some(t=>[102,1005,340,350,360].includes(t.code)))throw new Error('Unsupported block child reference closure');if(!['LINE','POINT','CIRCLE','ARC','LWPOLYLINE'].includes(child.type))throw new Error('Unsupported block child Explode');}
   }else if(!['LWPOLYLINE','POLYLINE'].includes(e.type) || e.geometry.vertices.some(v=>v.startWidth || v.endWidth) || e.geometry.constantWidth || (e.attributes.flags & (8|16|64)))throw new Error('Unsupported polyline width/3D Explode');
 }
}
