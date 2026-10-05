export function bulgeArc(a,b,bulge) {
  const dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy);
  if(!Number.isFinite(bulge))throw new Error('Invalid finite bulge');
  if(chord===0 || bulge===0)return null;
  const offset=chord*(1-bulge*bulge)/(4*bulge);
  const center={x:(a.x+b.x)/2-dy/chord*offset,y:(a.y+b.y)/2+dx/chord*offset,z:a.z??0};
  return {center,radius:chord*(1+bulge*bulge)/(4*Math.abs(bulge)),startAngle:Math.atan2(a.y-center.y,a.x-center.x),sweep:4*Math.atan(bulge)};
}
export function sampleBulge(a,b,bulge,segments=32) {
  const arc=bulgeArc(a,b,bulge);if(!arc)return [{...a},{...b}];
  const count=Math.max(4,2*Math.ceil(Math.abs(arc.sweep)/Math.PI*segments/4)),out=[];
  for(let i=0;i<=count;i++) {
    const t=i/count,angle=arc.startAngle+t*arc.sweep;
    out.push({x:arc.center.x+arc.radius*Math.cos(angle),y:arc.center.y+arc.radius*Math.sin(angle),z:(a.z??0)+t*((b.z??0)-(a.z??0))});
  }
  out[0]={...a};out[out.length-1]={...b};return out;
}
/** Rational de Boor evaluation uses native degree, knot domain and homogeneous weights. */
export function evaluateSpline(g,u) {
  const p=g.degree,n=g.controlPoints.length-1,k=g.knots,w=g.weights || [];
  if(!Number.isInteger(p) || p<1 || n<p || k.length!==n+p+2 || k.some((v,i)=>!Number.isFinite(v)||(i>0 && v<k[i-1])) ||
     (w.length && (w.length!==n+1 || w.some(v=>!Number.isFinite(v) || !(v>0)))))throw new Error('Unsupported or invalid native spline basis');
  const lo=k[p],hi=k[n+1];if(!(hi>lo))throw new Error('Degenerate spline domain');
  u=Math.max(lo,Math.min(hi,u));let span=n;
  if(u<hi)for(let i=p;i<=n;i++)if(u>=k[i] && u<k[i+1]){span=i;break;}
  const d=[];for(let j=0;j<=p;j++) {const q=g.controlPoints[span-p+j],weight=w[span-p+j]??1;d.push([q.x*weight,q.y*weight,(q.z??0)*weight,weight]);}
  for(let r=1;r<=p;r++)for(let j=p;j>=r;j--) {
    const index=span-p+j,denom=k[index+p-r+1]-k[index],a=denom===0?0:(u-k[index])/denom;
    for(let axis=0;axis<4;axis++)d[j][axis]=(1-a)*d[j-1][axis]+a*d[j][axis];
  }
  if(!(d[p][3]>0))throw new Error('Invalid spline homogeneous weight');
  return {x:d[p][0]/d[p][3],y:d[p][1]/d[p][3],z:d[p][2]/d[p][3]};
}
export function sampleNativeSpline(g,segments=64) {
  const p=g.degree,n=g.controlPoints.length,lo=g.knots[p],hi=g.knots[n],out=[];
  const count=Math.max(4,segments);
  for(let i=0;i<=count;i++)out.push(evaluateSpline(g,lo+(hi-lo)*i/count));return out;
}
