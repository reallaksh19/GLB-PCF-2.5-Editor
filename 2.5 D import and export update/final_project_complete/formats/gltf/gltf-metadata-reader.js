/*
 * formats/gltf/gltf-metadata-reader.js
 *
 * Helper functions to extract editor metadata from glTF/GLB nodes.  The
 * Canonical Edit Graph relies on this metadata to classify objects
 * when converting a glTF scene into CEG components.  Metadata may
 * originate from several places: node.extras.glbPcfEditor (highest
 * priority), the node’s own extras, or the node/mesh/material names.
 *
 * For this simplified wave‑2 implementation we primarily look for
 * `extras.glbPcfEditor` attached to a node.  If none is found we
 * return an empty object to signal a generic mesh.  Future
 * enhancements can extend this reader to inspect mesh/material
 * names or infer pipe candidates from geometry.
 */

/**
 * Read canonical editor metadata from a glTF node.  The returned
 * object is a shallow copy of whatever data was present on
 * `extras.glbPcfEditor`.  If no such metadata exists the function
 * returns an empty object.  Callers should treat the absence of
 * metadata as a signal that the object is a generic mesh.
 *
 * @param {Object} node The glTF node definition.
 * @returns {Object} Metadata for classification, or empty object.
 */
export function readGltfMetadata(node) {
  if (!node || typeof node !== 'object') {
    return {};
  }
  // glTF 2.0 stores application‑specific data under `extras`.  The
  // glbPcfEditor namespace is used by this app to persist canonical
  // identifiers, component types and geometry anchors.  When
  // present, copy it to avoid mutating the source object.
  const extras = node.extras;
  if (extras && typeof extras.glbPcfEditor === 'object') {
    return { ...extras.glbPcfEditor };
  }
  // No known metadata found; return empty object.  Further
  // classification (e.g. by name heuristics) could be added here.
  return {};
}

/**
 * Derive a human‑readable component name from a glTF node.  If a
 * canonicalId is present in the metadata it is returned.  Otherwise
 * the node’s own `name` property is returned, or an empty string
 * if no name is defined.  This helper is used by gltf‑to‑ceg when
 * assigning component IDs.
 *
 * @param {Object} node The glTF node definition.
 * @param {Object} [meta] Metadata previously returned by
 *        `readGltfMetadata`.  Optional.
 * @returns {string} A suggested identifier for the component.
 */
export function getGltfComponentName(node, meta) {
  const m = meta || {};
  if (m.canonicalId && typeof m.canonicalId === 'string') {
    return m.canonicalId;
  }
  return typeof node.name === 'string' ? node.name : '';
}