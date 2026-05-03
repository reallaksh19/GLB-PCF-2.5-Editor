/*
 * core/ceg/ceg-hash.js
 *
 * Deterministic hash for Canonical Edit Graphs.  Used by the command
 * dispatcher to record before/after state.  Adapted from the update
 * package: Node.js crypto replaced with a djb2-style browser hash
 * so it remains synchronous and dependency-free.
 */

/**
 * Recursively sort object keys for a stable JSON representation.
 * Arrays are preserved in declaration order.
 *
 * @param {any} value
 * @returns {any} Value with all plain-object keys sorted.
 */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const sorted = {};
    Object.keys(value).sort().forEach(k => { sorted[k] = sortKeys(value[k]); });
    return sorted;
  }
  return value;
}

/**
 * djb2-based string hash.  Returns a stable 8-character hex string.
 * Fast, synchronous, no external dependencies.
 *
 * @param {string} str
 * @returns {string} Hex digest.
 */
function djb2hex(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep as unsigned 32-bit
  }
  // XOR upper and lower 16-bits then format as 8-char hex
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compute a deterministic hash of a CEG.  Functions and undefined
 * values are excluded (standard JSON.stringify behaviour).
 *
 * @param {Object} graph CEG instance.
 * @returns {string} Hex digest string.
 */
export function hashCeg(graph) {
  const sorted = sortKeys(graph);
  const json   = JSON.stringify(sorted);
  return djb2hex(json);
}
