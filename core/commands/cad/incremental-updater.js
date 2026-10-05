import {DxfRenderAdapter} from '../../../formats/dxf/render/dxf-render-adapter.js';
/** Reproject touched roots using the full projection policy.
 * Global compaction and bounds remain O(scene size); no latency claim is made.
 */
export class IncrementalUpdater {
  static reconcile(changeSet,renderModel,spatialIndex,document,selectionManager=null,options={}) {
    const started=performance.now(),ids=new Set(changeSet?.affectedIds || []);
    const report={durationMs:0,addedCount:changeSet?.added.length || 0,modifiedCount:changeSet?.modified.length || 0,deletedCount:changeSet?.deleted.length || 0,primitivesAdded:0,primitivesRemoved:0};
    if(!ids.size)return report;
    const roots=[...ids].map(id=>document.entityIndex.get(id)).filter(e=>e && !e.state.deleted);
    const view=Object.create(document);view.entities=roots;
    const partial=DxfRenderAdapter.buildRenderModel(view,options);
    if(renderModel) {
      const retained=renderModel.primitives.filter(p=>!ids.has(p.sourceEntityId));
      report.primitivesRemoved=renderModel.primitives.length-retained.length;report.primitivesAdded=partial.primitives.length;
      renderModel.primitives=[...retained,...partial.primitives];renderModel.primitivesByEntityId=new Map();renderModel.primitivesByLayer=new Map();
      for(const p of renderModel.primitives) {
        const id=p.sourceEntityId,key=String(p.layer || '0').toUpperCase();
        if(!renderModel.primitivesByEntityId.has(id))renderModel.primitivesByEntityId.set(id,[]);renderModel.primitivesByEntityId.get(id).push(p);
        if(!renderModel.primitivesByLayer.has(key))renderModel.primitivesByLayer.set(key,[]);renderModel.primitivesByLayer.get(key).push(p);
      }
      renderModel.stats.totalPrimitives=renderModel.primitives.length;
      renderModel.diagnostics=(renderModel.diagnostics || []).filter(d=>!ids.has(d.entityId)).concat(partial.diagnostics);
      renderModel.recomputeBounds();
    }
    for(const id of ids) {
      spatialIndex?.remove(id);
      const entity=document.entityIndex.get(id);
      if(entity && !entity.state.deleted)spatialIndex?.insertFromEntity(entity,document);
      else if(selectionManager?.has(id))selectionManager.remove(id);
    }
    report.durationMs=performance.now()-started;return report;
  }
}
