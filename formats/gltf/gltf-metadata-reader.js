/*
 * formats/gltf/gltf-metadata-reader.js
 *
 * Reads canonical editor metadata from glTF/GLB node extras.
 * The namespace is extras.glbPcfEditor (highest priority).
 */

/**
 * Return a shallow copy of extras.glbPcfEditor, or {} if absent.
 *
 * @param {Object} node glTF node definition.
 * @returns {Object}
 */
export function readGltfMetadata(node) {
  if (!node || typeof node !== 'object') return {};
  const extras = node.extras;
  if (extras && typeof extras.glbPcfEditor === 'object') return { ...extras.glbPcfEditor };
  return {};
}

/**
 * Derive a human-readable component name from a glTF node.
 * Prefers canonicalId from metadata, then node.name.
 *
 * @param {Object} node
 * @param {Object} [meta] Result of readGltfMetadata().
 * @returns {string}
 */
export function getGltfComponentName(node, meta) {
  const m = meta || {};
  if (m.canonicalId && typeof m.canonicalId === 'string') return m.canonicalId;
  return typeof node.name === 'string' ? node.name : '';
}
