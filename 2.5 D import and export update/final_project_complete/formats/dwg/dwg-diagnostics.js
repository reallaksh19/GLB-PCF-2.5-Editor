/*
 * formats/dwg/dwg-diagnostics.js
 *
 * Collect and report diagnostics for DWG conversion operations.  The
 * DXF/GLB adapters record diagnostics in the graph’s loss
 * contract; this module focuses on the conversion layer.  It
 * exports helper functions to accumulate warnings and errors and
 * to reset the diagnostics between operations.
 */

const diagnostics = {
  warnings: [],
  errors: []
};

/**
 * Record a warning message during DWG conversion.
 *
 * @param {string} message Warning text.
 */
export function addDwgWarning(message) {
  diagnostics.warnings.push(String(message));
}

/**
 * Record an error message during DWG conversion.
 *
 * @param {string} message Error text.
 */
export function addDwgError(message) {
  diagnostics.errors.push(String(message));
}

/**
 * Get all collected diagnostics and clear the internal lists.
 *
 * @returns {Object} An object containing arrays of warnings and errors.
 */
export function flushDwgDiagnostics() {
  const result = {
    warnings: diagnostics.warnings.slice(),
    errors: diagnostics.errors.slice()
  };
  diagnostics.warnings.length = 0;
  diagnostics.errors.length = 0;
  return result;
}