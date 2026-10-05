/**
 * core/selection/selection-manager.js
 *
 * Format-independent CAD Selection Manager.
 * Stores stable source identifiers (e.g. 'dxf:entity:<HANDLE>'), NEVER Three.js
 * object references or volatile indices (Invariant 6).
 *
 * Supports:
 * - Point selection with pick tolerance
 * - Window selection (left -> right drag: fully contained)
 * - Crossing selection (right -> left drag: intersecting)
 * - Selection modes: SET, ADD (Shift/Ctrl), REMOVE, TOGGLE
 * - Layer, Entity Type, and "Select All Similar" filtering
 * - Bounding box aggregation for Zoom to Selection
 * - Event emission upon selection changes
 */

export const SELECTION_MODES = Object.freeze({
  SET: 'SET',
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  TOGGLE: 'TOGGLE',
});

export class SelectionManager {
  /**
   * @param {Object} [options]
   * @param {Array<string>|Set<string>} [options.initialIds]
   */
  constructor(options = {}) {
    this._ids = new Set(options.initialIds || []);
    this._primaryId = options.initialIds?.length ? Array.from(options.initialIds)[0] : null;
    this._listeners = new Set();
  }

  get count() {
    return this._ids.size;
  }

  get primaryId() {
    return this._primaryId;
  }

  get ids() {
    return new Set(this._ids);
  }

  isEmpty() {
    return this._ids.size === 0;
  }

  has(id) {
    if (!id) return false;
    return this._ids.has(String(id));
  }

  getIds() {
    return Array.from(this._ids);
  }

  getState() {
    return {
      ids: new Set(this._ids),
      primaryId: this._primaryId,
      count: this._ids.size,
    };
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(added = [], removed = []) {
    const state = this.getState();
    const event = {
      ...state,
      added,
      removed,
      timestamp: Date.now(),
    };
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('SelectionManager listener error:', err);
      }
    }
  }

  /**
   * Apply selection updates using specified mode.
   *
   * @param {string|Array<string>|Set<string>} inputIds
   * @param {string} [mode='SET'] - 'SET' | 'ADD' | 'REMOVE' | 'TOGGLE'
   * @returns {boolean} Whether selection actually changed
   */
  select(inputIds, mode = SELECTION_MODES.SET) {
    const rawList = Array.isArray(inputIds)
      ? inputIds
      : inputIds instanceof Set
      ? Array.from(inputIds)
      : inputIds != null
      ? [inputIds]
      : [];

    const idsToApply = rawList.filter(Boolean).map(String);
    const added = [];
    const removed = [];

    switch (mode) {
      case SELECTION_MODES.SET: {
        const nextSet = new Set(idsToApply);

        // Find removed
        for (const oldId of this._ids) {
          if (!nextSet.has(oldId)) {
            removed.push(oldId);
          }
        }
        // Find added
        for (const newId of nextSet) {
          if (!this._ids.has(newId)) {
            added.push(newId);
          }
        }

        this._ids = nextSet;
        this._primaryId = idsToApply.length > 0 ? idsToApply[idsToApply.length - 1] : null;
        break;
      }

      case SELECTION_MODES.ADD: {
        for (const id of idsToApply) {
          if (!this._ids.has(id)) {
            this._ids.add(id);
            added.push(id);
          }
          this._primaryId = id;
        }
        break;
      }

      case SELECTION_MODES.REMOVE: {
        for (const id of idsToApply) {
          if (this._ids.has(id)) {
            this._ids.delete(id);
            removed.push(id);
          }
        }
        if (this._primaryId && !this._ids.has(this._primaryId)) {
          this._primaryId = this._ids.size > 0 ? Array.from(this._ids)[0] : null;
        }
        break;
      }

      case SELECTION_MODES.TOGGLE: {
        for (const id of idsToApply) {
          if (this._ids.has(id)) {
            this._ids.delete(id);
            removed.push(id);
          } else {
            this._ids.add(id);
            added.push(id);
            this._primaryId = id;
          }
        }
        if (this._primaryId && !this._ids.has(this._primaryId)) {
          this._primaryId = this._ids.size > 0 ? Array.from(this._ids)[0] : null;
        }
        break;
      }

      default:
        throw new Error(`Unsupported selection mode: ${mode}`);
    }

    const changed = added.length > 0 || removed.length > 0;
    if (changed) {
      this._notify(added, removed);
    }
    return changed;
  }

  set(ids) {
    return this.select(ids, SELECTION_MODES.SET);
  }

  add(ids) {
    return this.select(ids, SELECTION_MODES.ADD);
  }

  remove(ids) {
    return this.select(ids, SELECTION_MODES.REMOVE);
  }

  toggle(ids) {
    return this.select(ids, SELECTION_MODES.TOGGLE);
  }

  clear() {
    return this.select([], SELECTION_MODES.SET);
  }

  /**
   * CAD Point Selection via Spatial Index.
   * If point hits a block child primitive, its sourceEntityId already points
   * to the parent INSERT instance.
   *
   * @param {number} x
   * @param {number} y
   * @param {Object} spatialIndex - DxfSpatialIndex or SpatialIndex2D
   * @param {Object} [options]
   * @param {number} [options.tolerance=5]
   * @param {string} [options.mode='SET']
   * @returns {boolean} Whether selection changed
   */
  selectPoint(x, y, spatialIndex, options = {}) {
    if (!spatialIndex) return false;
    const tol = options.tolerance ?? 5;
    const mode = options.mode || SELECTION_MODES.SET;

    const hits = spatialIndex.searchPoint(x, y, tol);
    const candidateId = hits.length > 0 ? (hits[0].id || hits[0]) : null;

    if (!candidateId) {
      if (mode === SELECTION_MODES.SET) {
        return this.clear();
      }
      return false;
    }

    return this.select(candidateId, mode);
  }

  /**
   * CAD Window Selection (left-to-right drag):
   * Selects only entities whose bounding box is FULLY CONTAINED within windowBox.
   *
   * @param {Object} windowBox - { minX, minY, maxX, maxY }
   * @param {Object} spatialIndex
   * @param {Object} [options]
   * @returns {boolean}
   */
  selectWindow(windowBox, spatialIndex, options = {}) {
    if (!spatialIndex) return false;
    const mode = options.mode || SELECTION_MODES.SET;
    const hits = spatialIndex.searchWindow(windowBox);
    const ids = hits.map((h) => (h.id || h));
    return this.select(ids, mode);
  }

  /**
   * CAD Crossing Selection (right-to-left drag):
   * Selects entities whose bounding box INTERSECTS or touches crossingBox.
   *
   * @param {Object} crossingBox - { minX, minY, maxX, maxY }
   * @param {Object} spatialIndex
   * @param {Object} [options]
   * @returns {boolean}
   */
  selectCrossing(crossingBox, spatialIndex, options = {}) {
    if (!spatialIndex) return false;
    const mode = options.mode || SELECTION_MODES.SET;
    const hits = spatialIndex.searchCrossing(crossingBox);
    const ids = hits.map((h) => (h.id || h));
    return this.select(ids, mode);
  }

  /**
   * CAD Select by Layer:
   * Selects all entities residing on the specified layer.
   *
   * @param {string} layerName
   * @param {Object} layerSource - DxfDocument, RenderModel, or layer entity map
   * @param {Object} [options]
   * @returns {boolean}
   */
  selectByLayer(layerName, layerSource, options = {}) {
    if (!layerName || !layerSource) return false;
    const mode = options.mode || SELECTION_MODES.SET;
    let targetIds = [];

    if (typeof layerSource.getEntityIdsOnLayer === 'function') {
      targetIds = Array.from(layerSource.getEntityIdsOnLayer(layerName));
    } else if (typeof layerSource.getPrimitivesForLayer === 'function') {
      const prims = layerSource.getPrimitivesForLayer(layerName);
      const set = new Set(prims.map((p) => p.sourceEntityId).filter(Boolean));
      targetIds = Array.from(set);
    } else if (layerSource.layerEntityIndex instanceof Map) {
      const set = layerSource.layerEntityIndex.get(String(layerName).trim().toUpperCase());
      if (set) targetIds = Array.from(set);
    }

    return this.select(targetIds, mode);
  }

  /**
   * CAD Select by Entity Type:
   * Selects all entities matching the specified CAD type (e.g. 'LINE', 'CIRCLE', 'INSERT').
   *
   * @param {string} entityType
   * @param {Object} source - DxfDocument or RenderModel
   * @param {Object} [options]
   * @returns {boolean}
   */
  selectByType(entityType, source, options = {}) {
    if (!entityType || !source) return false;
    const mode = options.mode || SELECTION_MODES.SET;
    const targetType = String(entityType).trim().toUpperCase();
    const ids = new Set();

    if (Array.isArray(source.entities)) {
      for (const ent of source.entities) {
        if (ent && String(ent.type).toUpperCase() === targetType && ent.id) {
          ids.add(ent.id);
        }
      }
    } else if (Array.isArray(source.primitives)) {
      for (const prim of source.primitives) {
        if (prim && String(prim.type).toUpperCase() === targetType && prim.sourceEntityId) {
          ids.add(prim.sourceEntityId);
        }
      }
    }

    return this.select(Array.from(ids), mode);
  }

  /**
   * CAD Select All Similar:
   * Selects all entities that match both the entity type and layer of reference entity.
   *
   * @param {string} [refId] - sourceEntityId (defaults to primaryId)
   * @param {Object} source - DxfDocument or RenderModel
   * @param {Object} [options]
   * @returns {boolean}
   */
  selectAllSimilar(refId, source, options = {}) {
    const targetId = refId || this._primaryId;
    if (!targetId || !source) return false;

    let refType = null;
    let refLayer = null;

    if (typeof source.getEntity === 'function') {
      const ent = source.getEntity(targetId);
      if (ent) {
        refType = String(ent.type || '').toUpperCase();
        refLayer = String(ent.layerId || '0').toUpperCase();
      }
    } else if (typeof source.getPrimitivesForEntity === 'function') {
      const prims = source.getPrimitivesForEntity(targetId);
      if (prims && prims.length > 0) {
        refType = String(prims[0].type || '').toUpperCase();
        refLayer = String(prims[0].layer || '0').toUpperCase();
      }
    }

    if (!refType || !refLayer) return false;

    const matchedIds = new Set();

    if (Array.isArray(source.entities)) {
      for (const ent of source.entities) {
        if (
          ent &&
          String(ent.type).toUpperCase() === refType &&
          String(ent.layerId || '0').toUpperCase() === refLayer &&
          ent.id
        ) {
          matchedIds.add(ent.id);
        }
      }
    } else if (Array.isArray(source.primitives)) {
      for (const prim of source.primitives) {
        if (
          prim &&
          String(prim.type).toUpperCase() === refType &&
          String(prim.layer || '0').toUpperCase() === refLayer &&
          prim.sourceEntityId
        ) {
          matchedIds.add(prim.sourceEntityId);
        }
      }
    }

    return this.select(Array.from(matchedIds), options.mode || SELECTION_MODES.SET);
  }

  /**
   * Compute composite bounding box for all currently selected entities.
   * Enables CAD "Zoom to Selection".
   *
   * @param {Object} boundsSource - DxfSpatialIndex or function (id) => bounds
   * @returns {Object|null} Composite AABB { min, max, size, center } or null
   */
  getSelectionBounds(boundsSource) {
    if (this.isEmpty() || !boundsSource) return null;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let validCount = 0;

    for (const id of this._ids) {
      let b = null;
      if (typeof boundsSource.getEntityBounds === 'function') {
        b = boundsSource.getEntityBounds(id);
      } else if (typeof boundsSource === 'function') {
        b = boundsSource(id);
      }

      if (b && (b.valid !== false) && b.min && b.max) {
        minX = Math.min(minX, b.min.x);
        minY = Math.min(minY, b.min.y);
        minZ = Math.min(minZ, b.min.z ?? 0);
        maxX = Math.max(maxX, b.max.x);
        maxY = Math.max(maxY, b.max.y);
        maxZ = Math.max(maxZ, b.max.z ?? 0);
        validCount++;
      }
    }

    if (validCount === 0) return null;

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
      count: validCount,
    };
  }
}
