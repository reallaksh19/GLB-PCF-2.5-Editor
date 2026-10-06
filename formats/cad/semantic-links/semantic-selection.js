/**
 * formats/cad/semantic-links/semantic-selection.js
 *
 * Source-linked semantic selection resolution.
 * Resolves derived semantic components to exact authoritative native CAD IDs,
 * verifying revision freshness and rejecting ambiguous, unrecognized, read-only,
 * or unsupported occurrence targets before mutation.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

import { SemanticComponentRef } from './source-ref.js';
import { SemanticLinkManager } from './semantic-link-manager.js';

/**
 * Dedicated error class for semantic selection failures.
 */
export class SemanticSelectionError extends Error {
  /**
   * @param {string} message
   * @param {string} code - e.g. STALE_REVISION, UNRECOGNIZED_COMPONENT, READ_ONLY_TARGET, etc.
   * @param {Object} [details={}]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SemanticSelectionError';
    this.code = code;
    this.details = details;
    Object.assign(this, details);
  }
}

/**
 * Immutable container for resolved selection results.
 */
export class SemanticSelectionResult {
  /**
   * @param {Object} params
   * @param {Array<string>} params.nativeEntityIds
   * @param {Array<SemanticComponentRef>} params.components
   * @param {string} [params.documentId]
   * @param {number} [params.sourceRevision=0]
   */
  constructor({
    nativeEntityIds = [],
    components = [],
    documentId = null,
    sourceRevision = 0,
  }) {
    this.nativeEntityIds = Object.freeze([...nativeEntityIds]);
    this.components = Object.freeze([...components]);
    this.documentId = documentId;
    this.sourceRevision = Number(sourceRevision) || 0;
    this.count = this.nativeEntityIds.length;
    this.componentCount = this.components.length;
  }

  toJSON() {
    return {
      nativeEntityIds: [...this.nativeEntityIds],
      componentIds: this.components.map(c => c.componentId),
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      count: this.count,
      componentCount: this.componentCount,
    };
  }
}

function currentDocumentRevision(document) {
  const value = document?.revision ?? document?.sourceRevision ?? 0;
  const revision = Number(value);
  return Number.isFinite(revision) ? revision : 0;
}

/**
 * Resolver mapping derived semantic selections to authoritative native CAD entities.
 */
export class SemanticSelectionResolver {
  /**
   * @param {Object} options
   * @param {SemanticLinkManager} options.linkManager
   * @param {string} [options.documentId]
   */
  constructor({ linkManager, documentId = null }) {
    if (!linkManager || !(linkManager instanceof SemanticLinkManager)) {
      throw new Error('SemanticSelectionResolver requires a valid SemanticLinkManager');
    }
    this.linkManager = linkManager;
    this.documentId = documentId || linkManager.documentId;
  }

  /**
   * Resolves semantic components or IDs to exact native CAD entity IDs.
   * Rejects stale revisions, missing entities, locked layers, read-only entities,
   * ambiguous mappings, and nested occurrence targets.
   *
   * @param {string|Array<string>|SemanticComponentRef|Array<SemanticComponentRef>} selection
   * @param {Object} document - Authoritative DxfDocument
   * @param {Object} [options]
   * @param {boolean} [options.allowOccurrence=false]
   * @returns {SemanticSelectionResult}
   */
  resolve(selection, document, options = {}) {
    if (!document) {
      throw new SemanticSelectionError(
        'Document is required for semantic selection resolution',
        'MISSING_DOCUMENT'
      );
    }

    const currentRev = currentDocumentRevision(document);
    if (!this.linkManager.isFresh(currentRev)) {
      throw new SemanticSelectionError(
        `Semantic selection is stale: link manager is at revision ${this.linkManager.sourceRevision}, document is at revision ${currentRev}`,
        'STALE_REVISION',
        { linkRevision: this.linkManager.sourceRevision, documentRevision: currentRev }
      );
    }

    if (this.documentId && document.id && this.documentId !== document.id) {
      throw new SemanticSelectionError(
        `Document identity mismatch: expected ${this.documentId}, got ${document.id}`,
        'DOCUMENT_MISMATCH',
        { expectedDocumentId: this.documentId, actualDocumentId: document.id }
      );
    }

    if (document.readOnly) {
      throw new SemanticSelectionError(
        'Document is in read-only state',
        'READ_ONLY_TARGET',
        { documentId: document.id }
      );
    }

    const rawItems = Array.isArray(selection)
      ? selection
      : (selection != null ? [selection] : []);

    if (rawItems.length === 0) {
      return new SemanticSelectionResult({
        nativeEntityIds: [],
        components: [],
        documentId: document.id,
        sourceRevision: currentRev,
      });
    }

    const resolvedComponents = [];
    const seenCompIds = new Set();
    const resolvedEntityIds = new Set();

    for (const item of rawItems) {
      let comp = null;

      if (typeof item === 'string') {
        comp = this.linkManager.getComponent(item);
        if (!comp) {
          const compsForEntity = this.linkManager.getComponentsForEntity(item);
          if (compsForEntity.length === 1) {
            comp = compsForEntity[0];
          } else if (compsForEntity.length > 1) {
            throw new SemanticSelectionError(
              `Ambiguous selection: native entity ${item} links to multiple semantic components (${compsForEntity.map(c => c.componentId).join(', ')})`,
              'AMBIGUOUS_SELECTION',
              { entityId: item, candidates: compsForEntity.map(c => c.componentId) }
            );
          } else {
            throw new SemanticSelectionError(
              `Unrecognized semantic component or entity identifier: ${item}`,
              'UNRECOGNIZED_COMPONENT',
              { targetId: item }
            );
          }
        }
      } else if (item && typeof item.componentId === 'string') {
        comp = this.linkManager.getComponent(item.componentId);
        if (!comp) {
          throw new SemanticSelectionError(
            `Unrecognized semantic component: ${item.componentId}`,
            'UNRECOGNIZED_COMPONENT',
            { targetId: item.componentId }
          );
        }
      } else {
        throw new SemanticSelectionError(
          'Invalid selection item: expected string ID or SemanticComponentRef',
          'INVALID_SELECTION_ITEM',
          { item }
        );
      }

      if (!seenCompIds.has(comp.componentId)) {
        seenCompIds.add(comp.componentId);
        resolvedComponents.push(comp);
      }

      // Validate each bound source entity and its exact source provenance.
      for (const sourceRef of comp.sourceRefs) {
        if (sourceRef.documentId && document.id && sourceRef.documentId !== document.id) {
          throw new SemanticSelectionError(
            `Source reference document mismatch: expected ${document.id}, got ${sourceRef.documentId}`,
            'DOCUMENT_MISMATCH',
            {
              componentId: comp.componentId,
              cadEntityId: sourceRef.cadEntityId,
              expectedDocumentId: document.id,
              actualDocumentId: sourceRef.documentId,
            }
          );
        }

        if (!sourceRef.isFresh(currentRev)) {
          throw new SemanticSelectionError(
            `Stale source reference for component ${comp.componentId}: source is at revision ${sourceRef.sourceRevision}, document is at revision ${currentRev}`,
            'STALE_REVISION',
            {
              componentId: comp.componentId,
              cadEntityId: sourceRef.cadEntityId,
              sourceRevision: sourceRef.sourceRevision,
              documentRevision: currentRev,
            }
          );
        }

        if (!options.allowOccurrence && Array.isArray(sourceRef.occurrencePath) && sourceRef.occurrencePath.length > 0) {
          throw new SemanticSelectionError(
            `Unsupported mutation target: component ${comp.componentId} targets nested block occurrence path`,
            'UNSUPPORTED_OCCURRENCE_TARGET',
            { componentId: comp.componentId, occurrencePath: sourceRef.occurrencePath }
          );
        }

        const entity = typeof document.getEntity === 'function'
          ? document.getEntity(sourceRef.cadEntityId)
          : (Array.isArray(document.entities)
              ? document.entities.find(e => e.id === sourceRef.cadEntityId || e.handle === sourceRef.cadEntityId)
              : null);
        if (!entity || entity.state?.deleted) {
          throw new SemanticSelectionError(
            `Missing native source entity: ${sourceRef.cadEntityId} for component ${comp.componentId}`,
            'MISSING_SOURCE_ENTITY',
            { componentId: comp.componentId, cadEntityId: sourceRef.cadEntityId }
          );
        }

        if (entity.readOnly) {
          throw new SemanticSelectionError(
            `Native entity ${entity.id} is marked read-only`,
            'READ_ONLY_TARGET',
            { entityId: entity.id, componentId: comp.componentId }
          );
        }

        const layerName = entity.layerId || entity.layer || '0';
        const layer = document.getLayer ? document.getLayer(layerName) : null;
        if (layer?.locked || layer?.frozen) {
          throw new SemanticSelectionError(
            `Native entity ${entity.id} is on ${layer?.locked ? 'locked' : 'frozen'} layer ${layerName}`,
            'READ_ONLY_TARGET',
            { entityId: entity.id, layer: layerName, componentId: comp.componentId, locked: Boolean(layer?.locked), frozen: Boolean(layer?.frozen) }
          );
        }

        resolvedEntityIds.add(entity.id);
      }
    }

    return new SemanticSelectionResult({
      nativeEntityIds: Array.from(resolvedEntityIds),
      components: resolvedComponents,
      documentId: document.id,
      sourceRevision: currentRev,
    });
  }
}
