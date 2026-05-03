/*
 * formats/gltf/gltf-to-ceg.js
 *
 * Convert a parsed glTF/GLB scene (JSON object) into a Canonical Edit Graph.
 * Each node becomes a component.  Nodes with extras.glbPcfEditor metadata
 * get structured types (PIPE, BLOCK_COMPONENT).  Unknown nodes become
 * MESH_OBJECT with limited capabilities.
 */

import { createCanonicalEditGraph } from '../../core/ceg/canonical-edit-graph.js';
import { createComponent }          from '../../core/ceg/canonical-component.js';
import { createAnchor }             from '../../core/ceg/canonical-anchor.js';
import { defaultCapabilities }      from '../../core/ceg/capabilities.js';
import { readGltfMetadata, getGltfComponentName } from './gltf-metadata-reader.js';

let anchorSeq = 0;
let compSeq   = 0;
function nextAnchorId(prefix = 'ga') { return `${prefix}${++anchorSeq}`; }
function nextCompId(prefix = 'gc')   { return `${prefix}${++compSeq}`; }

/**
 * @param {Object} gltf  Parsed glTF JSON object.
 * @returns {Object} A new CEG instance.
 */
export function gltfToCeg(gltf) {
  if (!gltf || typeof gltf !== 'object') throw new TypeError('gltfToCeg expects a parsed glTF object');
  const graph = createCanonicalEditGraph({ sourceFormat: 'GLB' });
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const meta = readGltfMetadata(node);
    const name = getGltfComponentName(node, meta) || `Node_${i}`;

    let type = 'MESH_OBJECT', anchorIds = [], geometryRole = 'UNKNOWN';
    let attributes = {}, derived = {};

    if (meta.componentType === 'PIPE' && meta.ep1 && meta.ep2) {
      type = 'PIPE'; geometryRole = 'LINEAR';
      const a1Id = nextAnchorId(`${name}_ep1_`);
      const a2Id = nextAnchorId(`${name}_ep2_`);
      graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: { x: meta.ep1.x||0, y: meta.ep1.y||0, z: meta.ep1.z||0 } });
      graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: { x: meta.ep2.x||0, y: meta.ep2.y||0, z: meta.ep2.z||0 } });
      anchorIds = [a1Id, a2Id];
      if (meta.lineNo) attributes.lineNo = meta.lineNo;
      if (meta.size)   attributes.size   = meta.size;
      if (meta.spec)   attributes.spec   = meta.spec;
      if (meta.tag)    attributes.tag    = meta.tag;
      const dx = (meta.ep2.x||0)-(meta.ep1.x||0), dy = (meta.ep2.y||0)-(meta.ep1.y||0), dz = (meta.ep2.z||0)-(meta.ep1.z||0);
      derived.length = Math.sqrt(dx*dx + dy*dy + dz*dz);

    } else if (meta.componentType === 'BLOCK_COMPONENT') {
      type = 'BLOCK_COMPONENT'; geometryRole = 'POINT';
      const origin = meta.origin || { x:0, y:0, z:0 };
      const aId    = nextAnchorId(`${name}_origin_`);
      graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: origin.x||0, y: origin.y||0, z: origin.z||0 } });
      anchorIds = [aId];
      if (meta.tag)    attributes.tag    = meta.tag;
      if (meta.lineNo) attributes.lineNo = meta.lineNo;
      if (meta.size)   attributes.size   = meta.size;

    } else {
      type = 'MESH_OBJECT'; geometryRole = 'UNKNOWN';
      const aId = nextAnchorId(`${name}_origin_`);
      graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x:0, y:0, z:0 } });
      anchorIds = [aId];
      graph.diagnostics.push({
        type: 'UNKNOWN_MESH', nodeIndex: i,
        nodeName: typeof node.name === 'string' ? node.name : '',
        reason: 'No glbPcfEditor metadata; classified as MESH_OBJECT'
      });
    }

    const compId    = (meta && meta.canonicalId) ? meta.canonicalId : `GLB_COMP_${nextCompId()}`;
    const sourceRef = {
      format: 'GLB', nodeIndex: i,
      nodeName:  typeof node.name === 'string' ? node.name : null,
      meshIndex: typeof node.mesh === 'number'  ? node.mesh : null
    };
    if (meta.canonicalId)    sourceRef.canonicalId   = meta.canonicalId;
    if (meta.componentType)  sourceRef.componentType = meta.componentType;
    if (meta.lineNo)         sourceRef.lineNo        = meta.lineNo;
    if (meta.size)           sourceRef.size          = meta.size;

    graph.components[compId] = createComponent({
      id: compId, type, layerId: 'default', anchorIds,
      geometryRole, attributes, rawAttributes: {}, derived,
      capabilities: defaultCapabilities(type), sourceRef
    });
  }
  return graph;
}
