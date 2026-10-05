import {SpatialIndex2D} from '../../../core/spatial/spatial-index-2d.js';
import {computePointsBounds,boundsContains} from './entity-bounds.js';
import {sourcePaths,pathBoundsPoints,pathVisible,pathDistance,pathCrosses} from './native-selection-geometry.js';
const box=b=>({minX:b.minX??b.min.x,minY:b.minY??b.min.y,maxX:b.maxX??b.max.x,maxY:b.maxY??b.max.y});
function primitivePaths(p) {
  const type=p.type?.toUpperCase();
  if(type==='CIRCLE' || type==='ARC' || (type==='ELLIPSE' && p.axisX))return [{kind:'conic',center:p.center,u:p.axisX || {x:p.radius,y:0,z:0},v:p.axisY || {x:0,y:p.radius,z:0},
    start:type==='CIRCLE'?0:(p.startAngle??0)*Math.PI/180,sweep:type==='CIRCLE'?2*Math.PI:(((p.endAngle-p.startAngle)*Math.PI/180)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)||2*Math.PI,visible:p.style?.visible!==false}];
  if(p.bounds?.corners)return [{kind:'polygon',points:p.bounds.corners,visible:p.style?.visible!==false,approximate:true}];
  if(p.points?.length)return [{kind:'polyline',points:p.points,visible:p.style?.visible!==false,approximate:p.approximate}];
  if(p.position)return [{kind:'line',a:p.position,b:p.position,visible:p.style?.visible!==false}];
  return [];
}
/** Native source broad phase plus source-geometry refinement. Render input is a compatibility path. */
export class DxfSpatialIndex {
  constructor(spatialIndex) {
    this.tree=spatialIndex || new SpatialIndex2D();this.entityBoundsMap=new Map();this.entityMetaMap=new Map();this.itemMap=new Map();this.diagnostics=[];
  }
  clear() {this.tree.clear();this.entityBoundsMap.clear();this.entityMetaMap.clear();this.itemMap.clear();this.diagnostics=[];this.document=null;}
  get size() {return this.entityBoundsMap.size;}
  loadFromDocument(doc,options={}) {
    this.clear();this.document=doc;this.options={...options};if(!doc)return;
    const items=[];
    for(const entity of doc.entities) {
      this.entityMetaMap.set(entity.id,{layer:entity.layerId,type:entity.type,handle:entity.handle});
      try {
        const paths=sourcePaths(entity,doc),bounds=computePointsBounds(paths.flatMap(pathBoundsPoints));
        if(!bounds.valid){this.diagnostics.push({entityId:entity.id,code:'UNSUPPORTED_SELECTION_GEOMETRY'});continue;}
        const item={id:entity.id,...box(bounds),bounds,paths,entity,layer:entity.layerId,type:entity.type};
        this.itemMap.set(item.id,item);this.entityBoundsMap.set(item.id,bounds);items.push(item);
        if(paths.some(p=>p.approximate))this.diagnostics.push({entityId:entity.id,code:'APPROXIMATE_SELECTION_GEOMETRY'});
      }catch(error){this.diagnostics.push({entityId:entity.id,code:'INVALID_SELECTION_GEOMETRY',message:error.message});}
    }
    this.tree.load(items);
  }
  loadFromRenderModel(renderModel,options={}) {
    this.clear();this.options={...options};const groups=new Map();
    for(const p of renderModel?.primitives || []) {
      if(!groups.has(p.sourceEntityId))groups.set(p.sourceEntityId,[]);groups.get(p.sourceEntityId).push(p);
    }
    const items=[];
    for(const [id,primitives] of groups) {
      const paths=primitives.flatMap(primitivePaths),bounds=computePointsBounds(paths.flatMap(pathBoundsPoints));if(!bounds.valid)continue;
      const item={id,...box(bounds),bounds,paths,primitives,layer:primitives[0].layer,type:primitives[0].type};
      this.itemMap.set(id,item);this.entityBoundsMap.set(id,bounds);this.entityMetaMap.set(id,{layer:item.layer,type:item.type,handle:null});items.push(item);
    }
    this.tree.load(items);
  }
  eligiblePaths(item,options={}) {
    const policy={...this.options,...options};return (item.paths || []).filter(p=>pathVisible(p,this.document,policy) && (policy.includeHidden || p.visible!==false));
  }
  searchPoint(x,y,tolerance=5,options={}) {
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(tolerance)||tolerance<0)throw new Error('Invalid point query');
    return this.tree.searchPoint(x,y,tolerance).map(item=>({item,distance:Math.min(...this.eligiblePaths(item,options).map(p=>pathDistance({x,y},p)))}))
      .filter(row=>row.distance<=tolerance+1e-10).sort((a,b)=>a.distance-b.distance || a.item.id.localeCompare(b.item.id)).map(row=>row.item.id);
  }
  searchWindow(window,options={}) {
    const q=box(window);return this.tree.search(q).filter(item=>{
      const paths=this.eligiblePaths(item,options);return paths.length && boundsContains(q,computePointsBounds(paths.flatMap(pathBoundsPoints)));
    }).map(item=>item.id);
  }
  searchCrossing(crossing,options={}) {
    const q=box(crossing);return this.tree.search(q).filter(item=>this.eligiblePaths(item,options).some(p=>pathCrosses(p,q))).map(item=>item.id);
  }
  search(query) {return this.tree.search(box(query));} // Broad-phase candidate port; callers must refine.
  getEntityBounds(id) {return this.entityBoundsMap.get(String(id)) || null;}
  getEntityMeta(id) {return this.entityMetaMap.get(String(id)) || null;}
}
