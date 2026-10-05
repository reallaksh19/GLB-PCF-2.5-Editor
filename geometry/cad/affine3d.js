// Row-major 3x4 Float64 affine transforms. Composition retains shear and reflections.
export const identityAffine=()=>[1,0,0,0,0,1,0,0,0,0,1,0];
export function multiplyAffine(a,b) {
  const out=Array(12).fill(0);
  for(let r=0;r<3;r++)for(let c=0;c<4;c++) {
    out[r*4+c]=(c===3?a[r*4+3]:0);
    for(let k=0;k<3;k++)out[r*4+c]+=a[r*4+k]*b[k*4+c];
  }
  return out;
}
export function affinePoint(p,m=identityAffine(),base={x:0,y:0,z:0}) {
  const v=[p.x-(base.x??0),p.y-(base.y??0),(p.z??0)-(base.z??0)];
  return {x:m[0]*v[0]+m[1]*v[1]+m[2]*v[2]+m[3],y:m[4]*v[0]+m[5]*v[1]+m[6]*v[2]+m[7],z:m[8]*v[0]+m[9]*v[1]+m[10]*v[2]+m[11]};
}
export function affineVector(p,m) { return affinePoint(p,[m[0],m[1],m[2],0,m[4],m[5],m[6],0,m[8],m[9],m[10],0]); }
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=v=>{const n=Math.hypot(v.x,v.y,v.z);if(!(n>0))throw new Error('Invalid OCS normal');return {x:v.x/n,y:v.y/n,z:v.z/n};};
export function ocsAffine(normal={x:0,y:0,z:1}) {
  const z=unit(normal), x=unit(cross(Math.abs(z.x)<1/64 && Math.abs(z.y)<1/64?{x:0,y:1,z:0}:{x:0,y:0,z:1},z)), y=cross(z,x);
  return [x.x,y.x,z.x,0,x.y,y.y,z.y,0,x.z,y.z,z.z,0];
}
export function affineMetrics(m) {
  const x=Math.hypot(m[0],m[4],m[8]), y=Math.hypot(m[1],m[5],m[9]), z=Math.hypot(m[2],m[6],m[10]);
  const dot=m[0]*m[1]+m[4]*m[5]+m[8]*m[9];
  return {x,y,z,similarity:Math.abs(x-y)<=1e-12*Math.max(x,y,1) && Math.abs(dot)<=1e-12*Math.max(x*y,1)};
}
export function boundsOfPoints(points) {
  if(!points.length)return null;
  const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const p of points)for(const key of ['x','y','z']){const v=p[key]??0;min[key]=Math.min(min[key],v);max[key]=Math.max(max[key],v);}
  return {min,max,corners:[{...min},{...max}]};
}
