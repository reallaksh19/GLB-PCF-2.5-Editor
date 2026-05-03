/*
 * formats/gltf/gltf-to-ceg.js
 *
 * Convert a glTF/GLB scene into a Canonical Edit Graph (CEG).
 * Each node in the glTF scene is inspected for metadata via the
 * glbPcfEditor namespace (see gltf-metadata-reader.js).  Nodes
 * with explicit metadata become structured components in the CEG
 * (e.g. PIPE, BLOCK_COMPONENT).  Generic meshes and unknown objects
 * map to MESH_OBJECT components with limited capabilities.  The
 * resulting graph contains anchors and components but does not
 * preserve mesh geometry; editing occurs on the canonical model.
 */

import { createCanonicalEditGraph } from '../../core/ceg/canonical-edit-graph.js';
import { createComponent } from '../../core/ceg/canonical-component.js';
import { createAnchor } from '../../core/ceg/canonical-anchor.js';
import { defaultCapabilities } from '../../core/ceg/capabilities.js';
import { readGltfMetadata, getGltfComponentName } from './gltf-metadata-reader.js';

// Utilities to generate unique IDs for anchors and components
let anchorSeq = 0;
function nextAnchorId(prefix = 'ga') {
  anchorSeq += 1;
  return `${prefix}${anchorSeq}`;
}
let compSeq = 0;
function nextCompId(prefix = 'gc') {
  compSeq += 1;
  return `${prefix}${compSeq}`;
}

/**
 * Convert a parsed glTF scene into a Canonical Edit Graph.  The
 * resulting graph contains a component for each glTF node.  When
 * metadata is present the component type and geometry anchors are
 * derived accordingly.  Otherwise the node is treated as a generic
 * mesh object.  Unknown objects still become components so they
 * appear in the editor but have restricted capabilities.
 *
 * @param {Object} gltf The glTF asset parsed from JSON.
 * @param {Object} [options] Optional configuration (unused here).
 * @returns {Object} A new CEG instance.
 */
export function gltfToCeg(gltf, options = {}) {
  if (!gltf || typeof gltf !== 'object') {
    throw new TypeError('gltfToCeg expects a parsed glTF object');
  }
  const graph = createCanonicalEditGraph({ sourceFormat: 'GLB' });
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  // Iterate each node and create a component
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // Read metadata and derive a suggested name
    const meta = readGltfMetadata(node);
    const name = getGltfComponentName(node, meta) || `Node_${i}`;
    // Determine type and anchors based on metadata
    let type = 'MESH_OBJECT';
    let anchorIds = [];
    let geometryRole = 'UNKNOWN';
    let attributes = {};
    let derived = {};
    // Determine anchor positions depending on metadata
    if (meta && meta.componentType === 'PIPE' && meta.ep1 && meta.ep2) {
      type = 'PIPE';
      geometryRole = 'LINEAR';
      // Create two endpoint anchors
      const a1Id = nextAnchorId(`${name}_ep1_`);
      const a2Id = nextAnchorId(`${name}_ep2_`);
      graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: { x: meta.ep1.x || 0, y: meta.ep1.y || 0, z: meta.ep1.z || 0 } });
      graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: { x: meta.ep2.x || 0, y: meta.ep2.y || 0, z: meta.ep2.z || 0 } });
      anchorIds = [a1Id, a2Id];
      // Preserve attributes such as lineNo, size, spec, tag
      attributes = {};
      if (meta.lineNo) attributes.lineNo = meta.lineNo;
      if (meta.size) attributes.size = meta.size;
      if (meta.spec) attributes.spec = meta.spec;
      if (meta.tag) attributes.tag = meta.tag;
      // Derived properties can include length if endpoints defined
      const dx = (meta.ep2.x || 0) - (meta.ep1.x || 0);
      const dy = (meta.ep2.y || 0) - (meta.ep1.y || 0);
      const dz = (meta.ep2.z || 0) - (meta.ep1.z || 0);
      derived.length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    } else if (meta && meta.componentType === 'BLOCK_COMPONENT') {
      type = 'BLOCK_COMPONENT';
      geometryRole = 'POINT';
      // Create origin anchor based on metadata.origin or fallback to (0,0,0)
      const origin = meta.origin || { x: 0, y: 0, z: 0 };
      const aId = nextAnchorId(`${name}_origin_`);
      graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: origin.x || 0, y: origin.y || 0, z: origin.z || 0 } });
      anchorIds = [aId];
      attributes = {};
      if (meta.tag) attributes.tag = meta.tag;
      if (meta.lineNo) attributes.lineNo = meta.lineNo;
      if (meta.size) attributes.size = meta.size;
    } else {
      // Generic mesh or unknown object.  Create a single origin anchor at 0,0,0.
      type = 'MESH_OBJECT';
      geometryRole = 'UNKNOWN';
      const aId = nextAnchorId(`${name}_origin_`);
      graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: 0, y: 0, z: 0 } });
      anchorIds = [aId];
      attributes = {};
      // Record a diagnostic about unknown mesh classification.  This
      // helps the QA layer detect that this object may need manual
      // handling or user intervention.
      graph.diagnostics.push({
        type: 'UNKNOWN_MESH',
        nodeIndex: i,
        nodeName: typeof node.name === 'string' ? node.name : '',
        reason: 'No glbPcfEditor metadata found; classified as MESH_OBJECT'
      });
      // Nothing derived for generic mesh
    }
    // Compose component ID.  Use canonicalId if provided else generate one
    const compId = meta && meta.canonicalId ? meta.canonicalId : `GLB_COMP_${nextCompId()}`;
    // Build source reference to retain original node context
    const sourceRef = {
      format: 'GLB',
      nodeIndex: i,
      nodeName: typeof node.name === 'string' ? node.name : null,
      meshIndex: typeof node.mesh === 'number' ? node.mesh : null
    };
    if (meta && meta.canonicalId) sourceRef.canonicalId = meta.canonicalId;
    if (meta && meta.componentType) sourceRef.componentType = meta.componentType;
    if (meta && meta.lineNo) sourceRef.lineNo = meta.lineNo;
    if (meta && meta.size) sourceRef.size = meta.size;
    // Create component record
    const comp = createComponent({
      id: compId,
      type,
      layerId: 'default',
      anchorIds,
      geometryRole,
      attributes,
      rawAttributes: {},
      derived,
      capabilities: defaultCapabilities(type),
      sourceRef
    });
    graph.components[comp.id] = comp;
  }
  return graph;
}