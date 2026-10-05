/**
 * formats/cad/semantic-links/source-ref.js
 *
 * Source-reference contracts binding derived semantic components
 * to native CAD document entity IDs, revisions, and occurrence hierarchies.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

function cloneDerivedValue(value) {
  if (Array.isArray(value)) return value.map(cloneDerivedValue);
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [key, nested] of Object.entries(value)) copy[key] = cloneDerivedValue(nested);
    return copy;
  }
  return value;
}

/**
 * Immutable reference to an authoritative native CAD source entity.
 */
export class SourceRef {
  /**
   * @param {Object} params
   * @param {string} params.cadEntityId - Native entity identifier or handle
   * @param {string} [params.documentId] - Native document identity
   * @param {number} [params.sourceRevision=0] - Monotonic revision when linked
   * @param {Array<Object>} [params.occurrencePath=[]] - Hierarchical block occurrence steps
   * @param {string} [params.role='PRIMARY'] - Role of native entity (e.g. PRIMARY, CENTERLINE, PORT, SYMBOL)
   */
  constructor({
    cadEntityId,
    documentId = null,
    sourceRevision = 0,
    occurrencePath = [],
    role = 'PRIMARY',
  }) {
    if (!cadEntityId || typeof cadEntityId !== 'string') {
      throw new Error('SourceRef requires a non-empty string cadEntityId');
    }
    this.cadEntityId = cadEntityId;
    this.documentId = documentId;
    this.sourceRevision = Number(sourceRevision) || 0;
    this.occurrencePath = Array.isArray(occurrencePath)
      ? cloneDerivedValue(occurrencePath)
      : [];
    this.role = role || 'PRIMARY';
  }

  /**
   * Check if this source reference matches a given entity ID.
   * @param {string} entityIdOrHandle
   * @returns {boolean}
   */
  matchesEntity(entityIdOrHandle) {
    if (!entityIdOrHandle) return false;
    return this.cadEntityId === entityIdOrHandle ||
           this.cadEntityId.endsWith(`:${entityIdOrHandle}`);
  }

  /**
   * Check if this source ref is valid against the current document state.
   * @param {number} currentRevision
   * @returns {boolean}
   */
  isFresh(currentRevision) {
    return this.sourceRevision === currentRevision;
  }

  /**
   * Produce a plain serializable representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      cadEntityId: this.cadEntityId,
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      occurrencePath: cloneDerivedValue(this.occurrencePath),
      role: this.role,
    };
  }
}

/**
 * Semantic component referencing one or more native source entities.
 */
export class SemanticComponentRef {
  /**
   * @param {Object} params
   * @param {string} params.componentId - Unique semantic identifier (e.g. 'PIPE-001')
   * @param {string} params.componentType - Semantic type (e.g. 'PIPE', 'VALVE', 'FLANGE')
   * @param {Array<SourceRef>} [params.sourceRefs=[]] - Bound native entities
   * @param {Object} [params.properties={}] - Derived engineering properties
   * @param {number} [params.confidence=1.0] - Recognition confidence (0.0 to 1.0)
   * @param {string} [params.ruleId='MANUAL'] - Policy rule that derived this component
   */
  constructor({
    componentId,
    componentType,
    sourceRefs = [],
    properties = {},
    confidence = 1.0,
    ruleId = 'EXPLICIT',
  }) {
    if (!componentId || !componentType) {
      throw new Error('SemanticComponentRef requires componentId and componentType');
    }
    this.componentId = componentId;
    this.componentType = componentType;
    this.sourceRefs = sourceRefs.map(ref => ref instanceof SourceRef ? ref : new SourceRef(ref));
    this.properties = cloneDerivedValue(properties);
    this.confidence = Math.max(0, Math.min(1.0, Number(confidence) || 0));
    this.ruleId = ruleId;
  }

  /**
   * Get primary native entity ID.
   * @returns {string|null}
   */
  get primaryEntityId() {
    const primary = this.sourceRefs.find(r => r.role === 'PRIMARY') || this.sourceRefs[0];
    return primary ? primary.cadEntityId : null;
  }

  /**
   * Check if component references a specific native entity.
   * @param {string} entityIdOrHandle
   * @returns {boolean}
   */
  referencesEntity(entityIdOrHandle) {
    return this.sourceRefs.some(ref => ref.matchesEntity(entityIdOrHandle));
  }

  /**
   * Produce plain serializable object.
   * @returns {Object}
   */
  toJSON() {
    return {
      componentId: this.componentId,
      componentType: this.componentType,
      sourceRefs: this.sourceRefs.map(r => r.toJSON()),
      properties: cloneDerivedValue(this.properties),
      confidence: this.confidence,
      ruleId: this.ruleId,
    };
  }
}
