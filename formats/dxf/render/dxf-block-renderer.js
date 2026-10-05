import { resolveEntityStyle } from './dxf-style-resolver.js';
import { multiplyAffine,affinePoint,ocsAffine,affineMetrics } from '../../../geometry/cad/affine3d.js';
export const MAX_BLOCK_DEPTH=16;
const describe=matrix=>{
 const scale=affineMetrics(matrix),rad=Math.atan2(matrix[4],matrix[0]);
 return {matrix,translation:{x:matrix[3],y:matrix[7],z:matrix[11]},scale,rotationRad:rad,rotationDeg:rad*180/Math.PI,cos:Math.cos(rad),sin:Math.sin(rad)};
};
export function createInsertTransform(point={},scale={},rotationDeg=0,normal) {
 const rad=rotationDeg*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),sx=scale.x??1,sy=scale.y??1,sz=scale.z??1;
 return describe(multiplyAffine(ocsAffine(normal),[c*sx,-s*sy,0,point.x??0,s*sx,c*sy,0,point.y??0,0,0,sz,point.z??0]));
}
export function transformPoint(p,t=createInsertTransform(),base={x:0,y:0,z:0}) {return affinePoint(p,t.matrix,base);}
export function composeTransforms(parent,child,parentBase={x:0,y:0,z:0}) {
 const p=parent || createInsertTransform(),c=child || createInsertTransform();
 const shifted=[...p.matrix];
 const origin=affinePoint(parentBase,p.matrix);shifted[3]=2*p.matrix[3]-origin.x;shifted[7]=2*p.matrix[7]-origin.y;shifted[11]=2*p.matrix[11]-origin.z;
 return describe(multiplyAffine(shifted,c.matrix));
}
export function projectBlockInstance(insert,document,options={},callback) {
 if(!insert || !document || typeof callback!=='function')return 0;
 const block=document.getBlock(insert.attributes?.blockName);if(!block)return 0;
 const depth=options.depth??0;if(depth>=(options.maxBlockDepth??MAX_BLOCK_DEPTH))return 0;
 const stack=new Set(options.activeStack || []),key=block.name.toUpperCase();if(stack.has(key))return 0;stack.add(key);
 const rootId=options.rootInsertId || insert.id || 'dxf:entity:'+insert.handle;
 const rootHandle=options.rootInsertHandle || insert.handle;
 const parentStyle=resolveEntityStyle(insert,document,options.context);
 const layer=insert.layerId==='0'?(options.context?.parentLayer || '0'):insert.layerId;
 const rows=Math.max(1,insert.attributes.rows??insert.attributes.rowCount??1),cols=Math.max(1,insert.attributes.columns??insert.attributes.columnCount??1);
 const rotation=insert.geometry.rotation??0,rad=rotation*Math.PI/180;
 let total=0;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) {
  const dx=c*(insert.attributes.columnSpacing??0),dy=r*(insert.attributes.rowSpacing??0),ip=insert.geometry.insertionPoint || insert.geometry.point || {};
  const local=createInsertTransform({x:(ip.x??0)+dx*Math.cos(rad)-dy*Math.sin(rad),y:(ip.y??0)+dx*Math.sin(rad)+dy*Math.cos(rad),z:ip.z??0},insert.geometry.scale,rotation,insert.geometry.extrusion);
  const transform=options.parentTransform?composeTransforms(options.parentTransform,local,options.parentBasePoint):local;
  const path=[...(options.instancePath || []),{insertId:insert.id || insert.handle,row:r,column:c}];
  const context={parentLayer:layer,parentColor:parentStyle.color,parentLineType:parentStyle.lineType,parentLineWeight:parentStyle.lineWeight,visible:parentStyle.visible,inBlock:true};
  for(const child of block.entities) {
   const bctx={rootInsertId:rootId,rootInsertHandle:rootHandle,insertHandle:rootHandle,immediateInsertId:insert.id,immediateInsertHandle:insert.handle,
    blockName:block.name,childHandle:child.handle,leafEntityId:child.id,childType:child.type,depth:depth+1,basePoint:{...block.basePoint},instancePath:path};
   if(child.type==='INSERT')total+=projectBlockInstance(child,document,{...options,depth:depth+1,activeStack:stack,parentTransform:transform,parentBasePoint:block.basePoint,
    rootInsertId:rootId,rootInsertHandle:rootHandle,instancePath:path,context},callback);
   else {callback(child,resolveEntityStyle(child,document,context),transform,bctx);total++;}
  }
 }
 return total;
}
