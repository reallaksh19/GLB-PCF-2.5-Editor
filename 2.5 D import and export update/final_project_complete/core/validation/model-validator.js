/*
 * core/validation/model-validator.js
 *
 * Provides validation functions for Canonical Edit Graphs.  The
 * validator does not mutate the graph; it returns arrays of
 * errors and warnings.  Errors prevent the command from being
 * applied; warnings are informational only.
 */

/**
 * Validate the entire CEG.  Wave 1 performs a minimal set of
 * checks: anchor existence, linear component anchor count,
 * numeric coordinates and other invariants defined in
 * VALIDATION_CONTRACT.md.
 *
 * @param {Object} graph The CEG to validate.
 * @returns {{errors: Array, warnings: Array}} Collections of issues.
 */
export function validateModel(graph) {
  const errors = [];
  const warnings = [];

  // 1. Every component’s anchorIds reference existing anchors
  for (const compId of Object.keys(graph.components)) {
    const comp = graph.components[compId];
    if (!Array.isArray(comp.anchorIds)) continue;
    for (const aId of comp.anchorIds) {
      if (!graph.anchors[aId]) {
        errors.push({ code: 'MISSING_ANCHOR', message: `Component ${compId} references missing anchor ${aId}`, componentId: compId, anchorId: aId });
      }
    }
  }
  // 2. Linear components must have exactly two anchors
  for (const compId of Object.keys(graph.components)) {
    const comp = graph.components[compId];
    const type = comp.type;
    const role = comp.geometryRole;
    if ((type === 'LINE' || type === 'PIPE' || role === 'LINEAR') && Array.isArray(comp.anchorIds)) {
      if (comp.anchorIds.length !== 2) {
        errors.push({ code: 'LINEAR_ANCHOR_COUNT', message: `Linear component ${compId} must have exactly two anchors`, componentId: compId });
      }
    }
  }
  // 3. Anchor coordinates must be numeric
  for (const anchorId of Object.keys(graph.anchors)) {
    const anchor = graph.anchors[anchorId];
    ['x','y','z'].forEach(axis => {
      const val = anchor.point?.[axis];
      if (typeof val !== 'number' || Number.isNaN(val)) {
        errors.push({ code: 'INVALID_COORDINATE', message: `Anchor ${anchorId} has invalid ${axis} coordinate`, anchorId });
      }
    });
  }
  // Return validation result
  return { errors, warnings };
}