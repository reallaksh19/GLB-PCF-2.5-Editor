/**
 * formats/dxf/semantic/recognition-policy.js
 *
 * Versioned recognition policy for classifying native CAD entities
 * into piping semantic components (PIPE, VALVE, FITTING, FLANGE)
 * while explicitly rejecting deceptive generic drafting lines and non-piping blocks.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

export const RECOGNITION_POLICY_VERSION = '1.0.0';

/**
 * Standard keywords identifying piping process layers.
 */
const DEFAULT_PIPING_LAYER_PATTERNS = [
  /PIPE/i,
  /PIPING/i,
  /PROCESS/i,
  /^P-/i,
  /CHW/i,
  /CW/i,
  /STEAM/i,
  /FUEL/i,
  /DRAIN/i,
  /VENT/i,
  /SUPPLY/i,
  /RETURN/i,
];

/**
 * Standard keywords identifying drafting/non-piping layers.
 */
const DEFAULT_NON_PIPING_LAYER_PATTERNS = [
  /^0$/,
  /^DEFPOINTS$/i,
  /BORDER/i,
  /TITLE/i,
  /ANNOTATION/i,
  /TEXT/i,
  /DIM/i,
  /HATCH/i,
  /HIDDEN/i,
  /VIEWPORT/i,
  /GRID/i,
];

/**
 * Known piping block name patterns.
 */
const PIPING_BLOCK_PATTERNS = [
  { pattern: /VALVE|GATE|GLOBE|BALL|CHECK|BUTTERFLY/i, type: 'VALVE', rule: 'BLOCK_VALVE' },
  { pattern: /FLANGE|WELD_NECK|BLIND/i, type: 'FLANGE', rule: 'BLOCK_FLANGE' },
  { pattern: /ELBOW|BEND/i, type: 'ELBOW', rule: 'BLOCK_ELBOW' },
  { pattern: /TEE|REDUCER|CAP|COUPLING/i, type: 'FITTING', rule: 'BLOCK_FITTING' },
  { pattern: /PCD_|INSTRUMENT|FLOW_METER/i, type: 'INSTRUMENT', rule: 'BLOCK_INSTRUMENT' },
];

/**
 * Known non-piping block name patterns.
 */
const NON_PIPING_BLOCK_PATTERNS = [
  /TITLE/i,
  /NORTH/i,
  /ARROW/i,
  /REV/i,
  /DETAIL/i,
  /CALLOUT/i,
  /NOTE/i,
  /FRAME/i,
  /STAMP/i,
];

export class RecognitionPolicy {
  /**
   * @param {Object} [options]
   * @param {string} [options.version=RECOGNITION_POLICY_VERSION]
   * @param {Array<RegExp>} [options.pipingLayerPatterns]
   * @param {Array<RegExp>} [options.nonPipingLayerPatterns]
   * @param {number} [options.connectionTolerance=0.01]
   */
  constructor(options = {}) {
    this.version = options.version || RECOGNITION_POLICY_VERSION;
    this.pipingLayerPatterns = options.pipingLayerPatterns || DEFAULT_PIPING_LAYER_PATTERNS;
    this.nonPipingLayerPatterns = options.nonPipingLayerPatterns || DEFAULT_NON_PIPING_LAYER_PATTERNS;
    this.connectionTolerance = Number(options.connectionTolerance) || 0.01;
  }

  /**
   * Check if a layer name suggests piping content.
   * @param {string} layerName
   * @returns {boolean}
   */
  isPipingLayer(layerName) {
    if (!layerName || typeof layerName !== 'string') return false;
    const name = layerName.trim();
    if (this.nonPipingLayerPatterns.some(p => p.test(name))) return false;
    return this.pipingLayerPatterns.some(p => p.test(name));
  }

  /**
   * Classify a native CAD entity.
   * @param {Object} entity - DxfEntity
   * @returns {{recognized: boolean, componentType: string|null, confidence: number, ruleId: string, reasons: string[]}}
   */
  classifyEntity(entity) {
    if (!entity || !entity.type) {
      return {
        recognized: false,
        componentType: null,
        confidence: 0,
        ruleId: 'REJECT_INVALID_ENTITY',
        reasons: ['Entity is null or missing type'],
      };
    }

    const type = entity.type.toUpperCase();
    const layer = entity.layer || entity.attributes?.layer || '0';

    // Rule 1: Text, Dimensions, Hatches, and Leaders are explicitly non-piping
    if (['TEXT', 'MTEXT', 'DIMENSION', 'HATCH', 'LEADER', 'POINT'].includes(type)) {
      return {
        recognized: false,
        componentType: null,
        confidence: 0,
        ruleId: 'REJECT_ANNOTATION_TYPE',
        reasons: [`Entity type ${type} is drafting or annotation, not piping geometry`],
      };
    }

    // Rule 2: LINE classification
    if (type === 'LINE') {
      if (this.isPipingLayer(layer)) {
        return {
          recognized: true,
          componentType: 'PIPE',
          confidence: 0.95,
          ruleId: 'PIPE_FROM_LINE_ON_PIPING_LAYER',
          reasons: [`Line on recognized piping layer '${layer}'`],
        };
      }
      return {
        recognized: false,
        componentType: null,
        confidence: 0,
        ruleId: 'REJECT_DECEPTIVE_GENERIC_LINE',
        reasons: [`Line on non-piping layer '${layer}' rejected from becoming PIPE`],
      };
    }

    // Rule 3: INSERT classification
    if (type === 'INSERT') {
      const blockName = entity.attributes?.blockName || entity.geometry?.blockName || '';
      if (NON_PIPING_BLOCK_PATTERNS.some(p => p.test(blockName))) {
        return {
          recognized: false,
          componentType: null,
          confidence: 0,
          ruleId: 'REJECT_DECEPTIVE_GENERIC_INSERT',
          reasons: [`Block '${blockName}' is recognized as generic non-piping symbol`],
        };
      }

      for (const entry of PIPING_BLOCK_PATTERNS) {
        if (entry.pattern.test(blockName)) {
          return {
            recognized: true,
            componentType: entry.type,
            confidence: 0.90,
            ruleId: entry.rule,
            reasons: [`Block '${blockName}' matches piping pattern for ${entry.type}`],
          };
        }
      }

      // Check if insert is on a dedicated piping layer
      if (this.isPipingLayer(layer)) {
        return {
          recognized: true,
          componentType: 'FITTING',
          confidence: 0.70,
          ruleId: 'FITTING_FROM_INSERT_ON_PIPING_LAYER',
          reasons: [`Insert on piping layer '${layer}' defaulted to FITTING`],
        };
      }

      return {
        recognized: false,
        componentType: null,
        confidence: 0,
        ruleId: 'REJECT_UNRECOGNIZED_INSERT',
        reasons: [`Block '${blockName}' on layer '${layer}' not recognized as piping component`],
      };
    }

    // Rule 4: Other curves (ARC, CIRCLE)
    if (type === 'ARC' || type === 'CIRCLE') {
      if (this.isPipingLayer(layer)) {
        return {
          recognized: true,
          componentType: type === 'ARC' ? 'ELBOW' : 'PIPE',
          confidence: 0.85,
          ruleId: `CURVE_FROM_${type}`,
          reasons: [`${type} on piping layer '${layer}' recognized`],
        };
      }
    }

    return {
      recognized: false,
      componentType: null,
      confidence: 0,
      ruleId: 'REJECT_UNRECOGNIZED_TYPE',
      reasons: [`Entity type ${type} on layer '${layer}' is not recognized as piping`],
    };
  }
}

export function createDefaultRecognitionPolicy(options) {
  return new RecognitionPolicy(options);
}
