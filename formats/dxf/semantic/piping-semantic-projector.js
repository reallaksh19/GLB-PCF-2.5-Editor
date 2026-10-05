/**
 * formats/dxf/semantic/piping-semantic-projector.js
 *
 * Optional, source-linked piping semantic projection engine.
 * Derives piping semantic components (PIPE, VALVE, FITTING, FLANGE) from a native DXF document
 * according to an explicit versioned policy, maintaining bidirectional source links and
 * strict revision freshness while ensuring zero mutation to authoritative source data.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

import { SourceRef, SemanticComponentRef } from '../../cad/semantic-links/source-ref.js';
import { SemanticLinkManager } from '../../cad/semantic-links/semantic-link-manager.js';
import { RecognitionPolicy, createDefaultRecognitionPolicy } from './recognition-policy.js';
import { DXF_INSUNITS, scalePointToMm } from '../dxf-units.js';

const SOURCE_UNIT_MM = {
  MM: 1,
  MILLIMETER: 1,
  MILLIMETERS: 1,
  MILLIMETRE: 1,
  MILLIMETRES: 1,
  CM: 10,
  CENTIMETER: 10,
  CENTIMETERS: 10,
  CENTIMETRE: 10,
  CENTIMETRES: 10,
  M: 1000,
  METER: 1000,
  METERS: 1000,
  METRE: 1000,
  METRES: 1000,
  IN: 25.4,
  INCH: 25.4,
  INCHES: 25.4,
  FT: 304.8,
  FOOT: 304.8,
  FEET: 304.8,
  YD: 914.4,
  YARD: 914.4,
  YARDS: 914.4,
};

function resolveEngineeringUnitPolicy(document) {
  const units = document?.units || {};
  const insunits = Number(units.insunits);
  const insunitDef = Number.isFinite(insunits) ? DXF_INSUNITS[insunits] : null;
  const sourceUnit = String(units.sourceUnit || '').trim().toUpperCase();
  const sourceUnitMm = SOURCE_UNIT_MM[sourceUnit];

  if (insunitDef && insunits !== 0) {
    return {
      engineeringUnit: 'mm',
      mmPerSourceUnit: insunitDef.mmPerUnit,
      source: 'INSUNITS',
      sourceUnit: units.sourceUnit || insunitDef.label,
      insunits,
      isExplicit: true,
    };
  }

  if (sourceUnitMm) {
    return {
      engineeringUnit: 'mm',
      mmPerSourceUnit: sourceUnitMm,
      source: 'sourceUnit',
      sourceUnit: units.sourceUnit,
      insunits: Number.isFinite(insunits) ? insunits : 0,
      isExplicit: true,
    };
  }

  return {
    engineeringUnit: 'mm',
    mmPerSourceUnit: 1,
    source: 'UNSPECIFIED',
    sourceUnit: units.sourceUnit || 'UNSPECIFIED',
    insunits: Number.isFinite(insunits) ? insunits : 0,
    isExplicit: false,
    reason: 'No explicit source unit; numeric source coordinates are retained at 1 source unit = 1 engineering mm for derived output only',
  };
}

function currentDocumentRevision(document) {
  const value = document?.revision ?? document?.sourceRevision ?? 0;
  const revision = Number(value);
  return Number.isFinite(revision) ? revision : 0;
}

/**
 * Result container for a derived semantic projection.
 */
export class SemanticProjectionResult {
  /**
   * @param {Object} params
   */
  constructor({
    documentId,
    sourceRevision,
    policyVersion,
    components,
    linkManager,
    topology,
    rejectedEntities,
    statistics,
  }) {
    this.documentId = documentId;
    this.sourceRevision = sourceRevision;
    this.policyVersion = policyVersion;
    this.components = components || [];
    this.linkManager = linkManager;
    this.topology = topology || { nodes: [], segments: [] };
    this.rejectedEntities = rejectedEntities || [];
    this.statistics = statistics || {};
  }

  /**
   * Validate that this projection is fresh against the active document.
   * Throws Error with STALE_REVISION if document has advanced.
   *
   * @param {Object} document - DxfDocument
   * @returns {boolean}
   */
  validateFreshness(document) {
    if (!document) throw new Error('validateFreshness requires a target document');
    const currentRev = currentDocumentRevision(document);
    if (this.sourceRevision !== currentRev) {
      const err = new Error(`Semantic projection is stale: projected at rev ${this.sourceRevision}, current document is rev ${currentRev}`);
      err.code = 'STALE_REVISION';
      err.projectedRevision = this.sourceRevision;
      err.currentRevision = currentRev;
      throw err;
    }
    return true;
  }

  /**
   * Produce a plain serializable representation.
   * @returns {Object}
   */
  toJSON() {
    return {
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      policyVersion: this.policyVersion,
      componentCount: this.components.length,
      rejectedCount: this.rejectedEntities.length,
      components: this.components.map(c => c.toJSON()),
      topology: this.topology,
      statistics: this.statistics,
    };
  }
}

/**
 * Derive an optional piping semantic projection from a native CAD document.
 *
 * @param {Object} document - DxfDocument (strictly read-only)
 * @param {Object} [options]
 * @param {RecognitionPolicy} [options.policy]
 * @param {number} [options.confidenceThreshold=0.5]
 * @returns {SemanticProjectionResult}
 */
export function derivePipingCegFromDxfDocument(document, options = {}) {
  if (!document) {
    throw new Error('derivePipingCegFromDxfDocument requires a valid DxfDocument');
  }

  const policy = options.policy || createDefaultRecognitionPolicy();
  const requestedThreshold = Number(options.confidenceThreshold);
  const confidenceThreshold = Number.isFinite(requestedThreshold) ? requestedThreshold : 0.5;

  const docId = document.id || 'doc:default';
  const sourceRev = currentDocumentRevision(document);
  const unitPolicy = resolveEngineeringUnitPolicy(document);

  // Snapshot entity count before derivation to guard immutability
  const initialEntities = Array.isArray(document.entities)
    ? document.entities
    : (document.getEntities ? document.getEntities() : []);
  const initialCount = initialEntities.length;

  const linkManager = new SemanticLinkManager({
    documentId: docId,
    sourceRevision: sourceRev,
  });

  const components = [];
  const rejectedEntities = [];
  let compCounter = 1;

  for (const entity of initialEntities) {
    const classification = policy.classifyEntity(entity);

    if (classification.recognized && classification.confidence >= confidenceThreshold) {
      const compId = `${classification.componentType}-${String(compCounter++).padStart(3, '0')}`;
      const sourceRef = new SourceRef({
        cadEntityId: entity.id,
        documentId: docId,
        sourceRevision: sourceRev,
        role: 'PRIMARY',
      });

      // Extract geometry properties
      const props = {
        layer: entity.layerId ?? entity.layer ?? entity.attributes?.layer ?? '0',
        handle: entity.handle || null,
        rawType: entity.type,
        engineeringUnit: 'mm',
        sourceUnitConversion: { ...unitPolicy },
      };

      if (entity.type === 'LINE') {
        props.start = scalePointToMm(entity.geometry?.start || {}, unitPolicy.mmPerSourceUnit);
        props.end = scalePointToMm(entity.geometry?.end || {}, unitPolicy.mmPerSourceUnit);
        const dx = (props.end.x || 0) - (props.start.x || 0);
        const dy = (props.end.y || 0) - (props.start.y || 0);
        const dz = (props.end.z || 0) - (props.start.z || 0);
        props.length = Math.hypot(dx, dy, dz);
      } else if (entity.type === 'INSERT') {
        props.blockName = entity.attributes?.blockName || entity.geometry?.blockName || '';
        props.position = scalePointToMm(
          entity.geometry?.insertionPoint ?? entity.geometry?.point ?? {},
          unitPolicy.mmPerSourceUnit
        );
        props.rotation = Number(entity.geometry?.rotation ?? entity.attributes?.rotation ?? 0) || 0;
      }

      const compRef = new SemanticComponentRef({
        componentId: compId,
        componentType: classification.componentType,
        sourceRefs: [sourceRef],
        properties: props,
        confidence: classification.confidence,
        ruleId: classification.ruleId,
      });

      components.push(compRef);
      linkManager.registerComponent(compRef);
    } else {
      rejectedEntities.push({
        entityId: entity.id,
        type: entity.type,
        layer: entity.layerId ?? entity.layer ?? entity.attributes?.layer ?? '0',
        ruleId: classification.ruleId,
        reasons: classification.reasons,
      });
    }
  }

  // Construct basic topological connectivity
  const nodes = [];
  const segments = [];
  const tol = policy.connectionTolerance * unitPolicy.mmPerSourceUnit;

  function findOrCreateNode(pt) {
    if (!pt) return null;
    const existing = nodes.find(n =>
      Math.abs(n.x - pt.x) <= tol &&
      Math.abs(n.y - pt.y) <= tol &&
      Math.abs(n.z - (pt.z || 0)) <= tol
    );
    if (existing) return existing.id;
    const nodeId = `NODE-${String(nodes.length + 1).padStart(3, '0')}`;
    nodes.push({ id: nodeId, x: pt.x, y: pt.y, z: pt.z || 0 });
    return nodeId;
  }

  for (const comp of components) {
    if (comp.componentType === 'PIPE' && comp.properties.start && comp.properties.end) {
      const startNode = findOrCreateNode(comp.properties.start);
      const endNode = findOrCreateNode(comp.properties.end);
      segments.push({
        componentId: comp.componentId,
        startNode,
        endNode,
        length: comp.properties.length,
      });
    }
  }

  // Verify immutability invariant: entity count and document revision unchanged
  const postEntities = Array.isArray(document.entities)
    ? document.entities
    : (document.getEntities ? document.getEntities() : []);
  if (postEntities.length !== initialCount || currentDocumentRevision(document) !== sourceRev) {
    throw new Error('FATAL: derivePipingCegFromDxfDocument mutated the authoritative document');
  }

  const statistics = {
    totalEntities: initialCount,
    recognizedCount: components.length,
    rejectedCount: rejectedEntities.length,
    pipes: components.filter(c => c.componentType === 'PIPE').length,
    fittings: components.filter(c => c.componentType !== 'PIPE').length,
    topologyNodes: nodes.length,
    topologySegments: segments.length,
    unitConversion: { ...unitPolicy },
  };

  return new SemanticProjectionResult({
    documentId: docId,
    sourceRevision: sourceRev,
    policyVersion: policy.version,
    components,
    linkManager,
    topology: { nodes, segments },
    rejectedEntities,
    statistics,
  });
}
