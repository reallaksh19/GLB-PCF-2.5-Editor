/*
 * formats/dxf/dxf-preflight.js
 *
 * Provides a lightweight preflight scan for DXF files.  The
 * preflight does not parse the full DXF structure; instead it
 * inspects the input to estimate file size and counts of common
 * entities.  This is sufficient to choose load modes (NORMAL,
 * LARGE_FILE, LAYER_GATED) and present summary information to the
 * user before a full parse.
 */

import fs from 'fs';

/**
 * Perform a preflight scan of a DXF file.  Accepts a string or
 * Buffer containing the DXF data.  Returns an object containing
 * file statistics and estimated entity counts.  The detection is
 * performed using simple substring searches; it is not a full
 * syntactic parse.  Unknown entities are ignored for counting
 * purposes.
 *
 * @param {string|Buffer} input DXF content or path to file.
 * @returns {Object} Preflight statistics.
 */
export function dxfPreflight(input) {
  let data;
  // If a Buffer or string that is not a path, use as is
  if (Buffer.isBuffer(input)) {
    data = input.toString('utf8');
  } else if (typeof input === 'string') {
    // If it looks like a file path and exists on disk, read it
    try {
      if (fs.existsSync(input) && fs.statSync(input).isFile()) {
        data = fs.readFileSync(input, 'utf8');
      } else {
        data = input;
      }
    } catch (e) {
      data = input;
    }
  } else {
    throw new TypeError('dxfPreflight expects a string or Buffer');
  }
  const fileSizeBytes = Buffer.byteLength(data, 'utf8');
  // Simple counts based on substring matches.  These are
  // approximations and may over‑count if entity names appear in
  // comments or other sections.
  const matchCount = (pattern) => (data.match(new RegExp(pattern, 'gi')) || []).length;
  const estimatedLineCount = matchCount('\n');
  const estimatedEntityCount = matchCount('\n0\n');
  const estimatedLayerCount = matchCount('\nLAYER\n');
  const estimatedBlockCount = matchCount('\nBLOCK\n');
  const estimatedTextCount = matchCount('\nTEXT\n') + matchCount('\nMTEXT\n');
  // Determine load mode based on size thresholds
  let loadMode = 'NORMAL';
  if (fileSizeBytes > 50 * 1024 * 1024) {
    loadMode = 'LAYER_GATED';
  } else if (fileSizeBytes > 5 * 1024 * 1024) {
    loadMode = 'LARGE_FILE';
  }
  return {
    fileSizeBytes,
    estimatedLineCount,
    estimatedEntityCount,
    estimatedLayerCount,
    estimatedBlockCount,
    estimatedTextCount,
    loadMode
  };
}