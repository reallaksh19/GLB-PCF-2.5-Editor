/*
 * formats/dxf/dxf-layer-resolver.js
 *
 * Builds a layer map from a RawDXFModel.
 * Maps layer names → { count, visible }.
 */

export function buildLayerMap(model) {
  const layers = {};
  function add(entity) {
    const name = entity.layer || 'default';
    if (!layers[name]) layers[name] = { count: 0, visible: true };
    layers[name].count += 1;
  }
  for (const e of model.lines)       add(e);
  for (const e of model.arcs)        add(e);
  for (const e of model.texts)       add(e);
  for (const e of model.inserts)     add(e);
  for (const e of model.polylines)   add(e);
  for (const e of model.circles)     add(e);
  for (const e of model.unsupported) add(e);
  return layers;
}
