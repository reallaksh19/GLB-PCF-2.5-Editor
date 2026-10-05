/**
 * formats/cad/semantic-links/semantic-link-manager.js
 *
 * Bidirectional index manager maintaining links between native CAD source entities
 * and derived semantic components with revision freshness validation.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

import { SourceRef, SemanticComponentRef } from './source-ref.js';

export class SemanticLinkManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.documentId]
   * @param {number} [options.sourceRevision=0]
   */
  constructor(options = {}) {
    this.documentId = options.documentId || null;
    this.sourceRevision = Number(options.sourceRevision) || 0;
    this._components = new Map(); // componentId -> SemanticComponentRef
    this._entityToComponents = new Map(); // entityId -> Set<componentId>
  }

  /**
   * Register a semantic component reference.
   * @param {SemanticComponentRef} component
   */
  registerComponent(component) {
    if (!(component instanceof SemanticComponentRef)) {
      throw new Error('registerComponent requires a SemanticComponentRef instance');
    }

    const previous = this._components.get(component.componentId);
    if (previous) {
      for (const ref of previous.sourceRefs) {
        const set = this._entityToComponents.get(ref.cadEntityId);
        if (set) {
          set.delete(component.componentId);
          if (set.size === 0) this._entityToComponents.delete(ref.cadEntityId);
        }
      }
    }

    this._components.set(component.componentId, component);

    for (const ref of component.sourceRefs) {
      const eid = ref.cadEntityId;
      if (!this._entityToComponents.has(eid)) {
        this._entityToComponents.set(eid, new Set());
      }
      this._entityToComponents.get(eid).add(component.componentId);
    }
  }

  /**
   * Check if this link manager's revision is fresh against current document revision.
   * @param {number} currentDocumentRevision
   * @returns {boolean}
   */
  isFresh(currentDocumentRevision) {
    return this.sourceRevision === currentDocumentRevision;
  }

  /**
   * Look up component by its semantic identifier.
   * @param {string} componentId
   * @returns {SemanticComponentRef|null}
   */
  getComponent(componentId) {
    return this._components.get(componentId) || null;
  }

  /**
   * Look up all semantic components linked to a native entity ID or handle.
   * @param {string} entityIdOrHandle
   * @returns {Array<SemanticComponentRef>}
   */
  getComponentsForEntity(entityIdOrHandle) {
    if (!entityIdOrHandle) return [];
    const directSet = this._entityToComponents.get(entityIdOrHandle);
    if (directSet && directSet.size > 0) {
      return Array.from(directSet).map(id => this._components.get(id)).filter(Boolean);
    }

    // Try suffix match (e.g. handle lookup '101' against 'doc:handle:101')
    const results = [];
    for (const [eid, compIds] of this._entityToComponents.entries()) {
      if (eid === entityIdOrHandle || eid.endsWith(`:${entityIdOrHandle}`)) {
        for (const cid of compIds) {
          const comp = this._components.get(cid);
          if (comp && !results.includes(comp)) results.push(comp);
        }
      }
    }
    return results;
  }

  /**
   * Invalidate components referencing a modified or deleted native entity.
   * @param {string} entityIdOrHandle
   * @returns {Array<string>} List of invalidated component IDs
   */
  invalidateByEntityId(entityIdOrHandle) {
    const affected = this.getComponentsForEntity(entityIdOrHandle);
    const invalidatedIds = [];

    for (const comp of affected) {
      invalidatedIds.push(comp.componentId);
      this._components.delete(comp.componentId);

      // Clean up reverse mappings
      for (const ref of comp.sourceRefs) {
        const set = this._entityToComponents.get(ref.cadEntityId);
        if (set) {
          set.delete(comp.componentId);
          if (set.size === 0) this._entityToComponents.delete(ref.cadEntityId);
        }
      }
    }

    return invalidatedIds;
  }

  /**
   * Get all registered semantic components.
   * @returns {Array<SemanticComponentRef>}
   */
  getAllComponents() {
    return Array.from(this._components.values());
  }

  /**
   * Total number of registered components.
   * @returns {number}
   */
  get size() {
    return this._components.size;
  }

  /**
   * Serialize link index to plain JSON snapshot.
   * @returns {Object}
   */
  toSnapshot() {
    return {
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      components: this.getAllComponents().map(c => c.toJSON()),
    };
  }

  /**
   * Rehydrate from snapshot.
   * @param {Object} snapshot
   * @returns {SemanticLinkManager}
   */
  static fromSnapshot(snapshot) {
    const manager = new SemanticLinkManager({
      documentId: snapshot.documentId,
      sourceRevision: snapshot.sourceRevision,
    });
    if (Array.isArray(snapshot.components)) {
      for (const compJson of snapshot.components) {
        manager.registerComponent(new SemanticComponentRef(compJson));
      }
    }
    return manager;
  }
}
