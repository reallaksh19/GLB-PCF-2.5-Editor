import {identityAffine, multiplyAffine, affinePoint, affineVector, ocsAffine} from '../../../geometry/cad/affine3d.js';
import {bulgeArc, sampleNativeSpline} from '../../../geometry/cad/native-curves.js';
const tau=2*Math.PI, p=(x=0,y=0,z=0)=>({x,y,z}), mod=a=>(a%tau+tau)%tau;
const inside=(a,start,sweep)=>Math.abs(sweep)>=tau-1e-12 || mod((a-start)*Math.sign(sweep))<=Math.abs(sweep)+1e-12;
const curvePoint=(c,t)=>p(c.center.x+c.u.x*Math.cos(t)+c.v.x*Math.sin(t),c.center.y+c.u.y*Math.cos(t)+c.v.y*Math.sin(t),c.center.z+c.u.z*Math.cos(t)+c.v.z*Math.sin(t));
export function nativeTextCorners(e) {
  const g=e.geometry || {},a=e.attributes || {},height=Number(a.height??g.height)||2.5;
  let anchor=g.insertionPoint || g.point || p(),h=a.horizJust??0,v=a.vertJust??0;
  if(e.type==='MTEXT') {h=([0,0,1,2,0,1,2,0,1,2][a.attachmentPoint??1]);v=([0,3,3,3,2,2,2,1,1,1][a.attachmentPoint??1]);}
  else if((h || v) && g.alignmentPoint)anchor=g.alignmentPoint;
  const lines=String(a.text??e.text??'').split(/\r?\n|\\P/),width=Math.max(height,...lines.map(l=>l.length*height*(a.widthFactor??1)*.65)),totalHeight=lines.length*height*1.25;
  const dx=h===1||h===4?-width/2:h===2?-width:0,dy=v===3?-totalHeight:v===2?-totalHeight/2:v===0?-height*.2:0;
  const angle=(a.rotation??0)*(e.type==='MTEXT'?1:Math.PI/180),c=Math.cos(angle),s=Math.sin(angle);
  const plane=ocsAffine(g.extrusion);
  return [[dx,dy],[dx+width,dy],[dx+width,dy+totalHeight],[dx,dy+totalHeight]].map(([x,y])=>{
    const pt=p(anchor.x+x*c-y*s,anchor.y+x*s+y*c,anchor.z??0);
    return e.type==='MTEXT'?pt:affinePoint(pt,plane);
  });
}
function insertMatrix(e,base,grid=p()) {
  const g=e.geometry || {},anchor=g.insertionPoint || g.point || p(),scale=g.scale || p(1,1,1),a=(g.rotation??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const m=multiplyAffine(ocsAffine(g.extrusion),[c*scale.x,-s*scale.y,0,anchor.x+grid.x*c-grid.y*s,s*scale.x,c*scale.y,0,anchor.y+grid.x*s+grid.y*c,0,0,scale.z,anchor.z??0]);
  const shift=affineVector(base,m);m[3]-=shift.x;m[7]-=shift.y;m[11]-=shift.z;return m;
}
/** Source-only occurrence geometry; renderer tessellation and caches are never consulted. */
export function sourcePaths(e,doc,m=identityAffine(),ancestors=[],inheritedLayer='0',stack=new Set()) {
  const g=e.geometry || {},layer=e.layerId==='0'&&ancestors.length?inheritedLayer:e.layerId || '0';
  const meta={entity:e,ancestors,layer},toWorld=q=>affinePoint(q,m),plane=multiplyAffine(m,ocsAffine(g.extrusion));
  const conic=(center,u,v,start=0,sweep=tau,ocs=true)=>({kind:'conic',center:affinePoint(center,ocs?plane:m),u:affineVector(u,ocs?plane:m),v:affineVector(v,ocs?plane:m),start,sweep,meta});
  const line=(a,b,ocs=false)=>({kind:'line',a:affinePoint(a,ocs?plane:m),b:affinePoint(b,ocs?plane:m),meta});
  switch(e.type) {
    case 'INSERT': {
      const block=doc.getBlock(e.attributes?.blockName);if(!block || stack.has(block.name) || stack.size>=16)return [];
      const next=new Set(stack);next.add(block.name);const out=[];
      for(let row=0;row<(e.attributes.rows??e.attributes.rowCount??1);row++)for(let col=0;col<(e.attributes.columns??e.attributes.columnCount??1);col++) {
        const matrix=multiplyAffine(m,insertMatrix(e,block.basePoint,p(col*(e.attributes.columnSpacing??0),row*(e.attributes.rowSpacing??0))));
        for(const child of block.entities)out.push(...sourcePaths(child,doc,matrix,[...ancestors,{entity:e,layer}],layer,next));
      }
      return out;
    }
    case 'LINE':return [line(g.start,g.end)];
    case 'POINT':return [line(g.point,g.point)];
    case 'CIRCLE':case 'ARC': {
      const start=(g.startAngle??0)*Math.PI/180,end=(g.endAngle??360)*Math.PI/180;
      return [conic(g.center,p(g.radius),p(0,g.radius),e.type==='CIRCLE'?0:start,e.type==='CIRCLE'?tau:mod(end-start)||tau)];
    }
    case 'LWPOLYLINE':case 'POLYLINE': {
      const is3D=g.is3D || Boolean(e.attributes?.flags&8),v=(g.vertices || []).map(q=>({...q,z:is3D?(q.z??0):(g.elevation??q.z??0)})),out=[];
      for(let i=0;i<(g.closed?v.length:v.length-1);i++) {
        const a=v[i],b=v[(i+1)%v.length],arc=bulgeArc(a,b,Number(a.bulge)||0);
        out.push(arc?conic(arc.center,p(arc.radius),p(0,arc.radius),arc.startAngle,arc.sweep,!is3D):line(a,b,!is3D));
      }
      return out;
    }
    case 'ELLIPSE': {
      const axis=g.majorAxis,n=g.extrusion || p(0,0,1),cross=p(n.y*axis.z-n.z*axis.y,n.z*axis.x-n.x*axis.z,n.x*axis.y-n.y*axis.x),k=Math.hypot(axis.x,axis.y,axis.z)*g.ratio/Math.hypot(cross.x,cross.y,cross.z);
      return [conic(g.center,axis,p(cross.x*k,cross.y*k,cross.z*k),g.startParam??0,mod((g.endParam??tau)-(g.startParam??0))||tau,false)];
    }
    case 'TEXT':case 'MTEXT':return [{kind:'polygon',points:nativeTextCorners(e).map(toWorld),approximate:true,meta}];
    case 'SPLINE': {
      try {return [{kind:'polyline',points:sampleNativeSpline(g,128).map(toWorld),approximate:true,meta}];}catch{return [];}
    }
    case 'SOLID':case '3DFACE':return [{kind:'polygon',points:(g.points || []).map(toWorld),meta}];
    case 'LEADER':return [{kind:'polyline',points:(g.vertices || []).map(toWorld),meta}];
    default:return [];
  }
}
export function pathVisible(path,doc,options={}) {
  const chain=[...path.meta?.ancestors || [],{entity:path.meta?.entity,layer:path.meta?.layer}];
  return chain.every(({entity:e,layer})=>{
    if(!e)return true;if(e.state?.deleted)return false;
    if(!options.includePaperSpace && !e.definitionId && chain[0].entity===e && e.space!==(options.activeSpace || 'model'))return false;
    const l=doc?.getLayer(layer);
    return options.includeHidden || !(l?.off || l?.frozen || Number(e.style?.colorIndex)<0 || e.attributes?.invisible || e.source?.rawTags?.some(t=>t.code===60&&Number(t.value)===1));
  });
}
export function pathBoundsPoints(path) {
  if(path.kind==='line')return [path.a,path.b];
  if(path.kind!=='conic')return path.points || [];
  const angles=[path.start,path.start+path.sweep];
  for(const axis of ['x','y','z']) {
    const t=Math.atan2(path.v[axis],path.u[axis]);for(const a of [t,t+Math.PI])if(inside(a,path.start,path.sweep))angles.push(a);
  }
  return angles.map(t=>curvePoint(path,t));
}
const segmentDistance=(q,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/den)):0;
  return Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy);
};
function inPolygon(q,points) {
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];if((a.y>q.y)!==(b.y>q.y) && q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }
  return result;
}
export function pathDistance(q,path) {
  if(path.kind==='line')return segmentDistance(q,path.a,path.b);
  if(path.kind==='conic') {
    // Minimize source conic distance in parameter space, including arc endpoints.
    const distance=t=>{const p=curvePoint(path,t);return Math.hypot(q.x-p.x,q.y-p.y);};
    const n=128,step=path.sweep/n;let min=Infinity,index=0;
    for(let i=0;i<=n;i++){const d=distance(path.start+i*step);if(d<min){min=d;index=i;}}
    let lo=path.start+Math.max(0,index-1)*step,hi=path.start+Math.min(n,index+1)*step;if(lo>hi)[lo,hi]=[hi,lo];
    for(let i=0;i<70;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(distance(a)<distance(b))hi=b;else lo=a;}
    return Math.min(min,distance((lo+hi)/2));
  }
  if(path.kind==='polygon' && inPolygon(q,path.points))return 0;
  let min=Infinity;for(let i=0;i<path.points.length-1;i++)min=Math.min(min,segmentDistance(q,path.points[i],path.points[i+1]));
  if(path.kind==='polygon' && path.points.length)min=Math.min(min,segmentDistance(q,path.points.at(-1),path.points[0]));return min;
}
const inBox=(p,b)=>p.x>=b.minX-1e-10&&p.x<=b.maxX+1e-10&&p.y>=b.minY-1e-10&&p.y<=b.maxY+1e-10;
function segmentCrosses(a,b,box) {
  let lo=0,hi=1;for(const axis of ['x','y']) {
    const delta=b[axis]-a[axis],min=box[axis==='x'?'minX':'minY'],max=box[axis==='x'?'maxX':'maxY'];
    if(delta===0){if(a[axis]<min||a[axis]>max)return false;continue;}
    let t0=(min-a[axis])/delta,t1=(max-a[axis])/delta;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
  }return true;
}
export function pathCrosses(path,box) {
  if(path.kind==='line')return segmentCrosses(path.a,path.b,box);
  if(path.kind==='conic') {
    if(inBox(curvePoint(path,path.start),box)||inBox(curvePoint(path,path.start+path.sweep),box))return true;
    for(const [axis,key] of [['x','minX'],['x','maxX'],['y','minY'],['y','maxY']]) {
      const r=Math.hypot(path.u[axis],path.v[axis]),value=(box[key]-path.center[axis])/r;if(!Number.isFinite(value)||Math.abs(value)>1)continue;
      const phase=Math.atan2(path.v[axis],path.u[axis]),offset=Math.acos(value);
      for(const angle of [phase-offset,phase+offset])if(inside(angle,path.start,path.sweep)&&inBox(curvePoint(path,angle),box))return true;
    }return false;
  }
  for(let i=0;i<path.points.length-1;i++)if(segmentCrosses(path.points[i],path.points[i+1],box))return true;
  return path.kind==='polygon' && (segmentCrosses(path.points.at(-1),path.points[0],box)||inPolygon(p(box.minX,box.minY),path.points));
}
