/** Horizontal source-plane capability shared by snaps, grips and the 2D kernel. */
export function sourceVertices(entity) {
 const g=entity.geometry,threeD=g.is3D || Boolean(entity.attributes?.flags & 8);
 return (g.vertices || []).map(v=>({...v,z:threeD ? v.z ?? 0 : g.elevation ?? v.z ?? 0}));
}
export function insertionAnchor(entity) {
 const g=entity.geometry;
 return entity.type==='TEXT' && (entity.attributes?.horizJust || entity.attributes?.vertJust) && g.alignmentPoint ? g.alignmentPoint : g.insertionPoint || g.point;
}
export function sourcePlaneZ(entity) {
 const g=entity?.geometry;if(!g)return null;
 const n=g.extrusion;if(n && (n.x || n.y || n.z!==1))return null;
 const points=g.start ? [g.start,g.end] : g.center ? [g.center] : g.vertices ? sourceVertices(entity) : [insertionAnchor(entity)].filter(Boolean);
 if(!points.length || points.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z ?? 0)))return null;
 const z=points[0].z ?? 0;return points.every(p=>Math.abs((p.z ?? 0)-z)<1e-8) ? z : null;
}
