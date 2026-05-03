/*
 * formats/gltf/gltf-optimizer-hints.js
 *
 * Provide simple optimization hints for glTF assets.  In a more
 * sophisticated implementation these hints could instruct a GLTF
 * optimizer to perform mesh quantization, texture compression or
 * mesh merging.  For the purposes of Wave 2 this module returns
 * conservative defaults and may be expanded in future waves.
 */

/**
 * Generate optimization hints for a glTF asset.  The returned
 * object contains flags or configuration values that can be used
 * by downstream tools to tune compression or transformation.
 *
 * @param {Object} gltf The glTF asset.
 * @param {Object} [options] Optional configuration.
 * @returns {Object} A hints object.
 */
export function generateGltfOptimizerHints(gltf, options = {}) {
  // Currently we do not perform any optimization, so return default
  return {
    useMeshQuantization: false,
    useTextureCompression: false,
    targetPlatform: 'web'
  };
}