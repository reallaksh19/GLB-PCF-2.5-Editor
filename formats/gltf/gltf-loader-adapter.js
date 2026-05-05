/*
 * formats/gltf/gltf-loader-adapter.js  (browser build)
 *
 * Accepts a parsed glTF JSON object or a JSON string and returns the
 * parsed object.  Binary GLB loading in the browser is handled by
 * Three.js GLTFLoader (see scene-renderer.js) and produces objects
 * that can be fed directly to gltfToCeg().
 * Node.js fs dependency from the update package is not needed here.
 */

/**
 * Load / normalise a glTF asset.
 *
 * @param {string|Object} input JSON string or already-parsed object.
 * @returns {Object} Parsed glTF data.
 */
export function loadGltf(input) {
  if (typeof input === 'object' && input !== null) return input;
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch (e) { throw new Error('Failed to parse GLTF JSON data'); }
  }
  throw new TypeError('loadGltf expects a JSON string or parsed glTF object');
}
