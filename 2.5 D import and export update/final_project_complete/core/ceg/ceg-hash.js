/*
 * core/ceg/ceg-hash.js
 *
 * Provides a deterministic hashing function for Canonical Edit Graphs.
 * Hashes are used by the command dispatcher to detect changes
 * before and after applying a command.  Identical graphs should
 * always produce the same hash string regardless of key ordering in
 * plain JavaScript objects.
 */

import crypto from 'crypto';

/**
 * Recursively sort object keys to produce a stable string
 * representation.  Arrays are preserved in order.
 *
 * @param {any} value A JSON value.
 * @returns {any} The value with object keys sorted.
 */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  } else if (value && typeof value === 'object' && value.constructor === Object) {
    const sorted = {};
    Object.keys(value).sort().forEach(k => {
      sorted[k] = sortKeys(value[k]);
    });
    return sorted;
  }
  return value;
}

/**
 * Compute a SHA‑256 hash of the canonical graph.  This function
 * ignores functions, undefined values and prototype properties.
 *
 * @param {Object} graph The CEG instance.
 * @returns {string} A hex digest representing the graph.
 */
export function hashCeg(graph) {
  const sorted = sortKeys(graph);
  const json = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(json).digest('hex');
}