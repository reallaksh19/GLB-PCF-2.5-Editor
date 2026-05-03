/*
 * formats/gltf/ceg-to-gltf.js
 *
 * Serialize a CEG into a minimal glTF-like metadata object.
 * This does NOT rebuild mesh geometry — it only preserves canonical IDs
 * and attributes via extras.glbPcfEditor for round-trip fidelity.
 * Actual geometry must be attached by domain-specific consumers.
 */

/**
 * @param {Object} graph CEG.
 * @returns {Object} glTF-like JSON (asset, nodes, meshes).
 */
export function cegToGltf(graph) {
  if (!graph || typeof graph !== 'object') throw new TypeError('cegToGltf expects a canonical edit graph');

  const nodes  = [];
  const meshes = [];
  let   meshCounter = 0;

  function getAnchorPoint(comp, role) {
    for (const aid of (comp.anchorIds || [])) {
      const a = graph.anchors[aid];
      if (a && a.role === role) return a.point;
    }
    return null;
  }

  for (const comp of Object.values(graph.components)) {
    const meta = {
      schemaVersion: '1.0',
      canonicalId:   comp.id,
      componentType: comp.type,
      sourceFormat:  graph.document?.sourceFormat || 'CEG'
    };
    if (comp.attributes?.lineNo) meta.lineNo = comp.attributes.lineNo;
    if (comp.attributes?.size)   meta.size   = comp.attributes.size;
    if (comp.attributes?.spec)   meta.spec   = comp.attributes.spec;
    if (comp.attributes?.tag)    meta.tag    = comp.attributes.tag;

    if (comp.type === 'PIPE' || comp.type === 'LINE') {
      const ep1 = getAnchorPoint(comp, 'EP1');
      const ep2 = getAnchorPoint(comp, 'EP2');
      if (ep1 && ep2) { meta.ep1 = { x: ep1.x, y: ep1.y, z: ep1.z }; meta.ep2 = { x: ep2.x, y: ep2.y, z: ep2.z }; }
    } else if (comp.type === 'BLOCK_COMPONENT' || comp.type === 'MESH_OBJECT') {
      const origin = getAnchorPoint(comp, 'ORIGIN');
      if (origin) meta.origin = { x: origin.x, y: origin.y, z: origin.z };
    }

    nodes.push({ name: comp.id, mesh: meshCounter, extras: { glbPcfEditor: meta } });
    meshes.push({});
    meshCounter += 1;
  }

  return { asset: { version: '2.0', generator: 'ceg-to-gltf' }, nodes, meshes };
}
