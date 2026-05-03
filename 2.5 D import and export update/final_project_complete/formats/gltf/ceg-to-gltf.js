/*
 * formats/gltf/ceg-to-gltf.js
 *
 * Convert a Canonical Edit Graph (CEG) back into a glTF‑like
 * metadata representation.  This exporter does not attempt to
 * rebuild geometric meshes; instead it serializes only nodes
 * containing glbPcfEditor metadata suitable for round‑tripping
 * component identity and basic attributes.  Consumers of this
 * exporter can attach actual geometry to the nodes using other
 * domain‑specific functions.
 */

import { defaultCapabilities } from '../../core/ceg/capabilities.js';

/**
 * Serialize a CEG into a minimal glTF asset.  Each component
 * becomes a node with an extras.glbPcfEditor property.  Empty
 * meshes are created to satisfy glTF’s requirement that nodes
 * reference meshes when they are intended for rendering.  Real
 * mesh geometry is omitted; this exporter focuses on preserving
 * canonical IDs and attributes.
 *
 * @param {Object} graph The canonical edit graph to export.
 * @param {Object} [options] Optional configuration.
 * @returns {Object} A glTF‑like JSON object.
 */
export function cegToGltf(graph, options = {}) {
  if (!graph || typeof graph !== 'object') {
    throw new TypeError('cegToGltf expects a canonical edit graph');
  }
  const nodes = [];
  const meshes = [];
  let meshCounter = 0;
  // Helper to get anchor point by role
  function getAnchorPoint(comp, role) {
    const anchorIds = comp.anchorIds || [];
    for (const aid of anchorIds) {
      const anchor = graph.anchors[aid];
      if (anchor && anchor.role === role) {
        return anchor.point;
      }
    }
    return null;
  }
  Object.values(graph.components).forEach((comp) => {
    const node = {};
    // Use the component id as node name
    node.name = comp.id;
    node.mesh = meshCounter;
    meshes.push({});
    // Build glbPcfEditor metadata
    const meta = {
      schemaVersion: '1.0',
      canonicalId: comp.id,
      componentType: comp.type,
      sourceFormat: graph.document?.sourceFormat || 'CEG'
    };
    // Extract attributes onto metadata when present
    if (comp.attributes) {
      if (comp.attributes.lineNo) meta.lineNo = comp.attributes.lineNo;
      if (comp.attributes.size) meta.size = comp.attributes.size;
      if (comp.attributes.spec) meta.spec = comp.attributes.spec;
      if (comp.attributes.tag) meta.tag = comp.attributes.tag;
    }
    // Add endpoint or origin positions depending on component type
    if (comp.type === 'PIPE' || comp.type === 'LINE') {
      const ep1 = getAnchorPoint(comp, 'EP1');
      const ep2 = getAnchorPoint(comp, 'EP2');
      if (ep1 && ep2) {
        meta.ep1 = { x: ep1.x, y: ep1.y, z: ep1.z };
        meta.ep2 = { x: ep2.x, y: ep2.y, z: ep2.z };
      }
    } else if (comp.type === 'BLOCK_COMPONENT' || comp.type === 'MESH_OBJECT') {
      const origin = getAnchorPoint(comp, 'ORIGIN');
      if (origin) {
        meta.origin = { x: origin.x, y: origin.y, z: origin.z };
      }
    }
    node.extras = { glbPcfEditor: meta };
    nodes.push(node);
    meshCounter += 1;
  });
  return {
    asset: { version: '2.0', generator: 'ceg-to-gltf' },
    nodes,
    meshes
  };
}