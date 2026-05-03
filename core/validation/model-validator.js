/*
 * core/validation/model-validator.js
 *
 * Validates a Canonical Edit Graph.  Returns { errors, warnings }.
 * Errors prevent a command from being applied; warnings are informational.
 */

/**
 * Validate the entire CEG.  Checks:
 *   1. Every component's anchorIds reference existing anchors.
 *   2. LINEAR components have exactly two anchors.
 *   3. All anchor coordinates are finite numbers.
 *
 * @param {Object} graph CEG instance.
 * @returns {{ errors: Array, warnings: Array }}
 */
export function validateModel(graph) {
  const errors   = [];
  const warnings = [];

  for (const compId of Object.keys(graph.components)) {
    const comp = graph.components[compId];
    if (!Array.isArray(comp.anchorIds)) continue;

    // 1. Anchor existence
    for (const aId of comp.anchorIds) {
      if (!graph.anchors[aId]) {
        errors.push({
          code: 'MISSING_ANCHOR',
          message: `Component ${compId} references missing anchor ${aId}`,
          componentId: compId, anchorId: aId
        });
      }
    }

    // 2. Linear component anchor count
    const isLinear = comp.type === 'LINE' || comp.type === 'PIPE' || comp.geometryRole === 'LINEAR';
    if (isLinear && comp.anchorIds.length !== 2) {
      errors.push({
        code: 'LINEAR_ANCHOR_COUNT',
        message: `Linear component ${compId} must have exactly two anchors`,
        componentId: compId
      });
    }
  }

  // 3. Numeric coordinates
  for (const anchorId of Object.keys(graph.anchors)) {
    const anchor = graph.anchors[anchorId];
    for (const axis of ['x', 'y', 'z']) {
      const val = anchor.point?.[axis];
      if (typeof val !== 'number' || Number.isNaN(val)) {
        errors.push({
          code: 'INVALID_COORDINATE',
          message: `Anchor ${anchorId} has invalid ${axis} coordinate`,
          anchorId
        });
      }
    }
  }

  return { errors, warnings };
}
