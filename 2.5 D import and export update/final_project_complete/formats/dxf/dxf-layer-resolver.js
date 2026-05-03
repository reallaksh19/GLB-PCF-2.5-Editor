/*
 * formats/dxf/dxf-layer-resolver.js
 *
 * Provides utilities for extracting layer definitions from a
 * RawDXFModel.  Layers are represented as simple objects with
 * visibility metadata.  In Wave 2 these definitions are only used
 * for informational purposes; layer visibility is controlled via
 * commands in later waves.
 */

/**
 * Build a layer map from a RawDXFModel.  The returned object maps
 * layer names to a simple metadata object containing a count of
 * entities in the layer.  Unknown layers are grouped under
 * `default`.
 *
 * @param {Object} model Raw DXF model.
 * @returns {Object} Layer map.
 */
export function buildLayerMap(model) {
  const layers = {};
  function add(entity) {
    const name = entity.layer || 'default';
    if (!layers[name]) {
      layers[name] = { count: 0, visible: true };
    }
    layers[name].count += 1;
  }
  for (const line of model.lines) add(line);
  for (const arc of model.arcs) add(arc);
  for (const text of model.texts) add(text);
  for (const ins of model.inserts) add(ins);
  for (const pl of model.polylines) add(pl);
  for (const circ of model.circles) add(circ);
  for (const unk of model.unsupported) add(unk);
  return layers;
}