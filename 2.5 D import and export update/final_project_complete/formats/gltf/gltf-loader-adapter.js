/*
 * formats/gltf/gltf-loader-adapter.js
 *
 * Provides a lightweight GLTF/GLB loader for Wave 2.  This adapter
 * accepts a JSON string, JavaScript object or file path and
 * returns a parsed object representing the GLTF asset.  It does
 * not perform any Three.js loading or rendering; it merely
 * deserializes the data.  Binary .glb files are not supported
 * in this simplified implementation.
 */

import fs from 'fs';

/**
 * Load a GLTF/GLB file into a JavaScript object.  Accepts either
 * a parsed object, a JSON string, or a file path.  If the input
 * cannot be parsed the function throws an error.
 *
 * @param {string|Object} input File path, JSON string or object.
 * @returns {Object} Parsed GLTF data.
 */
export function loadGltf(input) {
  let data;
  if (typeof input === 'object' && input !== null) {
    // Assume already parsed
    return input;
  }
  if (typeof input !== 'string') {
    throw new TypeError('loadGltf expects a file path, JSON string or object');
  }
  // If input is a path and exists, read from file
  try {
    if (fs.existsSync(input) && fs.statSync(input).isFile()) {
      data = fs.readFileSync(input, 'utf8');
    } else {
      data = input;
    }
  } catch (e) {
    data = input;
  }
  try {
    const parsed = JSON.parse(data);
    return parsed;
  } catch (e) {
    throw new Error('Failed to parse GLTF JSON data');
  }
}