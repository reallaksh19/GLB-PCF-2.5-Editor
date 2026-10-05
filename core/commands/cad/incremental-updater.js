/**
 * core/commands/cad/incremental-updater.js
 *
 * Incremental Projection and Spatial Reconciliation Service.
 * Updates RenderModel and SpatialIndex in-place following a CAD ChangeSet,
 * avoiding expensive full-scene rebuilds on single or batch edits.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { projectEntity } from '../../../formats/dxf/render/dxf-entity-projector.js';
import { resolveEntityStyle } from '../../../formats/dxf/render/dxf-style-resolver.js';

export class IncrementalUpdater {
  /**
   * Reconcile RenderModel, SpatialIndex, and SelectionManager given a ChangeSet and DxfDocument.
   *
   * @param {import('./change-set.js').ChangeSet} changeSet
   * @param {import('../../../formats/dxf/render/dxf-geometry-sampler.js').RenderModel} renderModel
   * @param {import('../../../formats/dxf/spatial/dxf-spatial-index.js').DxfSpatialIndex} spatialIndex
   * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} document
   * @param {import('../../selection/selection-manager.js').SelectionManager} [selectionManager]
   * @param {Object} [options]
   * @param {number} [options.arcSegments=36]
   * @param {number} [options.splineSegments=32]
   * @param {number} [options.maxBlockDepth=16]
   * @returns {Object} Reconciliation report
   */
  static reconcile(changeSet, renderModel, spatialIndex, document, selectionManager = null, options = {}) {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (!changeSet || !changeSet.hasChanges()) {
      return {
        durationMs: 0,
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        primitivesAdded: 0,
        primitivesRemoved: 0,
      };
    }

    const arcSegments = options.arcSegments || 36;
    const splineSegments = options.splineSegments || 32;
    const maxBlockDepth = options.maxBlockDepth || 16;

    let primitivesAdded = 0;
    let primitivesRemoved = 0;

    // Helper: remove all primitives belonging to an entity ID from RenderModel
    function removeEntityPrimitives(eid) {
      if (!renderModel || !eid) return;
      const oldPrims = renderModel.getPrimitivesForEntity(eid);
      if (oldPrims.length === 0) return;

      primitivesRemoved += oldPrims.length;
      const oldSet = new Set(oldPrims);

      // Remove from global primitive array
      renderModel.primitives = renderModel.primitives.filter((p) => !oldSet.has(p));

      // Remove from layer index
      for (const p of oldPrims) {
        const layerKey = String(p.layer || '0').trim().toUpperCase();
        const layerList = renderModel.primitivesByLayer.get(layerKey);
        if (layerList) {
          renderModel.primitivesByLayer.set(layerKey, layerList.filter((item) => !oldSet.has(item)));
        }
      }

      // Remove from entity primitive map
      renderModel.primitivesByEntityId.delete(eid);

      if (renderModel.stats) {
        renderModel.stats.totalPrimitives = Math.max(0, (renderModel.stats.totalPrimitives || 0) - oldPrims.length);
      }
    }

    // Helper: project an entity and add its primitives to RenderModel
    function projectAndAddEntity(entity) {
      if (!renderModel || !entity || entity.state?.deleted) return [];
      const eid = entity.id;
      const style = resolveEntityStyle(entity, document);
      const newPrims = [];

      const ctx = {
        addPrimitive: (prim) => {
          if (!prim) return;
          newPrims.push(prim);
        },
        stats: renderModel.stats || {},
        document,
        arcSegments,
        splineSegments,
        maxBlockDepth,
      };

      projectEntity(entity, style, null, null, ctx);

      if (newPrims.length > 0) {
        primitivesAdded += newPrims.length;
        renderModel.primitives.push(...newPrims);
        renderModel.primitivesByEntityId.set(eid, newPrims);

        for (const prim of newPrims) {
          const layerKey = String(prim.layer || '0').trim().toUpperCase();
          let layerList = renderModel.primitivesByLayer.get(layerKey);
          if (!layerList) {
            layerList = [];
            renderModel.primitivesByLayer.set(layerKey, layerList);
          }
          layerList.push(prim);
        }

        if (renderModel.stats) {
          renderModel.stats.totalPrimitives = (renderModel.stats.totalPrimitives || 0) + newPrims.length;
        }
      }

      return newPrims;
    }

    // 1. Process DELETED entities
    for (const item of changeSet.deleted) {
      const eid = item.entityId || item.entity?.id;
      if (!eid) continue;

      if (selectionManager && selectionManager.has(eid)) {
        selectionManager.remove(eid);
      }

      removeEntityPrimitives(eid);

      if (spatialIndex) {
        spatialIndex.remove(eid);
      }
    }

    // 2. Process MODIFIED entities
    for (const item of changeSet.modified) {
      const eid = item.entityId || item.entity?.id;
      if (!eid) continue;

      // Remove previous primitives and spatial index entry
      removeEntityPrimitives(eid);
      if (spatialIndex) {
        spatialIndex.remove(eid);
      }

      // Re-project updated entity
      const entity = item.entity || (document ? document.getEntity(eid) : null);
      if (entity && !entity.state?.deleted) {
        const newPrims = projectAndAddEntity(entity);
        if (spatialIndex && newPrims.length > 0) {
          spatialIndex.insertFromPrimitives(eid, newPrims);
        }
      }
    }

    // 3. Process ADDED entities
    for (const entity of changeSet.added) {
      if (!entity || entity.state?.deleted) continue;
      const eid = entity.id;

      const newPrims = projectAndAddEntity(entity);
      if (spatialIndex && newPrims.length > 0) {
        spatialIndex.insertFromPrimitives(eid, newPrims);
      }
    }

    // 4. Update overall bounds if primitives changed
    if (renderModel && typeof renderModel.recomputeBounds === 'function') {
      renderModel.recomputeBounds();
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    return {
      durationMs: endTime - startTime,
      addedCount: changeSet.added.length,
      modifiedCount: changeSet.modified.length,
      deletedCount: changeSet.deleted.length,
      primitivesAdded,
      primitivesRemoved,
    };
  }
}
