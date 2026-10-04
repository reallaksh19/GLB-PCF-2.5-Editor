/**
 * formats/dxf/spatial/dxf-spatial-index.js
 *
 * DXF Spatial Indexing Service.
 * Bridges DxfDocument and RenderModel into a 2D R-Tree spatial index,
 * mapping spatial queries directly to stable sourceEntityIds.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { SpatialIndex2D } from '../../../core/spatial/spatial-index-2d.js';
import { computeItemBounds, combineBounds } from './entity-bounds.js';

export class DxfSpatialIndex {
  /**
   * @param {SpatialIndex2D} [spatialIndex]
   */
  constructor(spatialIndex) {
    this.tree = spatialIndex || new SpatialIndex2D();
    this.entityBoundsMap = new Map(); // sourceEntityId -> AABB { minX, minY, maxX, maxY }
    this.entityMetaMap = new Map();   // sourceEntityId -> { type, layerId, handle }
  }

  clear() {
    this.tree.clear();
    this.entityBoundsMap.clear();
    this.entityMetaMap.clear();
  }

  get size() {
    return this.entityBoundsMap.size;
  }

  /**
   * Populate spatial index directly from a RenderModel.
   * Consolidates multi-primitive entities (e.g. block instances, polylines)
   * into unified entity bounds while preserving primitive links.
   *
   * @param {import('../render/dxf-render-adapter.js').RenderModel} renderModel
   */
  loadFromRenderModel(renderModel) {
    this.clear();
    if (!renderModel || !Array.isArray(renderModel.primitives)) return;

    // Group primitives by stable sourceEntityId
    const entityPrimitives = new Map(); // sourceEntityId -> Array<Primitive>

    for (const prim of renderModel.primitives) {
      if (!prim || !prim.sourceEntityId) continue;
      const eid = String(prim.sourceEntityId);
      let list = entityPrimitives.get(eid);
      if (!list) {
        list = [];
        entityPrimitives.set(eid, list);
      }
      list.push(prim);
    }

    const items = [];

    for (const [eid, primList] of entityPrimitives.entries()) {
      const boundsList = primList.map((p) => computeItemBounds(p));
      const combined = combineBounds(boundsList);

      if (combined.valid) {
        const item = {
          id: eid,
          minX: combined.min.x,
          minY: combined.min.y,
          maxX: combined.max.x,
          maxY: combined.max.y,
          layer: primList[0].layer,
          type: primList[0].type,
          bounds: combined,
          primitives: primList,
        };

        this.entityBoundsMap.set(eid, combined);
        this.entityMetaMap.set(eid, {
          layer: primList[0].layer,
          type: primList[0].type,
          handle: eid.replace(/^dxf:entity:/, ''),
        });

        items.push(item);
      }
    }

    this.tree.load(items);
  }

  /**
   * Populate spatial index directly from a DxfDocument.
   *
   * @param {import('../model/dxf-document.js').DxfDocument} doc
   */
  loadFromDocument(doc) {
    this.clear();
    if (!doc || !Array.isArray(doc.entities)) return;

    const items = [];

    for (const entity of doc.entities) {
      if (!entity || !entity.id) continue;
      const bounds = computeItemBounds(entity);

      if (bounds.valid) {
        const eid = entity.id;
        const item = {
          id: eid,
          minX: bounds.min.x,
          minY: bounds.min.y,
          maxX: bounds.max.x,
          maxY: bounds.max.y,
          layer: entity.layerId,
          type: entity.type,
          bounds,
          entity,
        };

        this.entityBoundsMap.set(eid, bounds);
        this.entityMetaMap.set(eid, {
          layer: entity.layerId,
          type: entity.type,
          handle: entity.handle,
        });

        items.push(item);
      }
    }

    this.tree.load(items);
  }

  /**
   * Query CAD entity IDs at a given point (x, y) with pick tolerance.
   * Returns array of unique sourceEntityIds sorted by distance to point.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} [tolerance=5]
   * @returns {Array<string>} sourceEntityIds
   */
  searchPoint(x, y, tolerance = 5) {
    const hits = this.tree.searchPoint(x, y, tolerance);
    const seen = new Set();
    const ids = [];

    for (const item of hits) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        ids.push(item.id);
      }
    }

    return ids;
  }

  /**
   * CAD Window Selection: returns entity IDs whose ENTIRE bounding box
   * is strictly contained within windowBox.
   *
   * @param {Object} windowBox - { minX, minY, maxX, maxY }
   * @returns {Array<string>} sourceEntityIds
   */
  searchWindow(windowBox) {
    const hits = this.tree.searchWindow(windowBox);
    const seen = new Set();
    const ids = [];

    for (const item of hits) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        ids.push(item.id);
      }
    }

    return ids;
  }

  /**
   * CAD Crossing Selection: returns entity IDs whose bounding box
   * intersects or touches crossingBox (includes contained entities).
   *
   * @param {Object} crossingBox - { minX, minY, maxX, maxY }
   * @returns {Array<string>} sourceEntityIds
   */
  searchCrossing(crossingBox) {
    const hits = this.tree.searchCrossing(crossingBox);
    const seen = new Set();
    const ids = [];

    for (const item of hits) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        ids.push(item.id);
      }
    }

    return ids;
  }

  /**
   * Retrieve the calculated AABB bounds for a given sourceEntityId.
   * @param {string} sourceEntityId
   * @returns {Object|null}
   */
  getEntityBounds(sourceEntityId) {
    return this.entityBoundsMap.get(String(sourceEntityId)) || null;
  }

  /**
   * Retrieve metadata (type, layer, handle) for a sourceEntityId.
   * @param {string} sourceEntityId
   * @returns {Object|null}
   */
  getEntityMeta(sourceEntityId) {
    return this.entityMetaMap.get(String(sourceEntityId)) || null;
  }
}
