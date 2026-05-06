/*
 * formats/dxf/dxf-raw-model.js
 *
 * Lightweight in-memory representation of DXF entities before CEG mapping.
 * Entities are grouped by type; unsupported entities go to `unsupported`.
 */

export function createRawDxfModel() {
  return {
    lines:       [],
    arcs:        [],
    texts:       [],
    inserts:     [],
    polylines:   [],
    circles:     [],
    guides:      [],
    blocks:      {},
    blockExpansions: [],
    diagnostics: [],
    unsupported: []
  };
}

export function addLine(model, entity)        { model.lines.push(entity); }
export function addArc(model, entity)         { model.arcs.push(entity); }
export function addText(model, entity)        { model.texts.push(entity); }
export function addInsert(model, entity)      { model.inserts.push(entity); }
export function addPolyline(model, entity)    { model.polylines.push(entity); }
export function addCircle(model, entity)      { model.circles.push(entity); }
export function addGuide(model, entity)       { model.guides.push(entity); }
export function addUnsupported(model, entity) { model.unsupported.push(entity); }
export function addDiagnostic(model, item)    { model.diagnostics.push(item); }

export function addBlockDefinition(model, blockName, definition) {
  if (!blockName) return;
  model.blocks[String(blockName).toUpperCase()] = {
    name: blockName,
    entities: Array.isArray(definition?.entities) ? definition.entities : [],
    basePoint: definition?.basePoint || definition?.position || { x: 0, y: 0, z: 0 },
    raw: definition || {},
  };
}

export function findBlockDefinition(model, blockName) {
  if (!blockName) return null;
  return model.blocks[String(blockName).toUpperCase()] || null;
}
