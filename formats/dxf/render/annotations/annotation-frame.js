import { ocsAffine } from '../../../../geometry/cad/affine3d.js';
import { nativeValue, finiteNumber } from './text-values.js';
export function annotationNormal(entity) {
  return entity.geometry?.extrusion || {
    x:finiteNumber(nativeValue(entity,210,0)),
    y:finiteNumber(nativeValue(entity,220,0)),
    z:finiteNumber(nativeValue(entity,230,1),1),
  };
}
const unit = v => {
  const n=Math.hypot(v.x,v.y,v.z);
  if (!Number.isFinite(n)||n===0) throw new Error('Invalid annotation direction');
  return {x:v.x/n,y:v.y/n,z:v.z/n};
};
export function mtextFrame(entity,rotationRad) {
  const normal=unit(annotationNormal(entity));
  const tags=entity.source?.rawTags || [];
  const angleAt=tags.findLastIndex(t=>Number(t.code)===50);
  const directionAt=tags.findLastIndex(t=>[11,21,31].includes(Number(t.code)));
  let dir=entity.geometry?.directionVector;
  if(directionAt>=0 && directionAt>angleAt)dir={x:finiteNumber(nativeValue(entity,11,1)),y:finiteNumber(nativeValue(entity,21,0)),z:finiteNumber(nativeValue(entity,31,0))};
  if(angleAt>directionAt && angleAt>=0)dir=null;
  if(dir) {
    const x=unit(dir);
    const y=unit({x:normal.y*x.z-normal.z*x.y,y:normal.z*x.x-normal.x*x.z,z:normal.x*x.y-normal.y*x.x});
    if(Math.abs(normal.x*x.x+normal.y*x.y+normal.z*x.z)>1e-8)throw new Error('MTEXT direction is outside its annotation plane');
    return {x,y};
  }
  const m=ocsAffine(normal),c=Math.cos(rotationRad),s=Math.sin(rotationRad);
  return {x:{x:m[0]*c+m[1]*s,y:m[4]*c+m[5]*s,z:m[8]*c+m[9]*s},
    y:{x:-m[0]*s+m[1]*c,y:-m[4]*s+m[5]*c,z:-m[8]*s+m[9]*c}};
}
