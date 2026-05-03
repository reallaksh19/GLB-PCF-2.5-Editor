/*
 * formats/dxf/dxf-raw-model.js
 *
 * Defines a lightweight in‑memory representation for DXF data.
 * The RawDXFModel stores entities grouped by type and preserves
 * low‑level details (handles, layers, vertices) without mapping
 * them into engineering semantics.  It is consumed by dxf‑to‑ceg.js
 * to build a Canonical Edit Graph.
 */

/**
 * Create an empty raw DXF model.  Each supported entity type has
 * its own array.  Unsupported or unrecognised entities are
 * collected into the `unsupported` array for diagnostic purposes.
 *
 * @returns {Object} Raw DXF model.
 */
export function createRawDxfModel() {
  return {
    lines: [],
    arcs: [],
    texts: [],
    inserts: [],
    polylines: [],
    circles: [],
    unsupported: []
  };
}

/**
 * Add a LINE entity to the model.
 * @param {Object} model The raw model.
 * @param {Object} entity Entity data.
 */
export function addLine(model, entity) {
  model.lines.push(entity);
}

/**
 * Add an ARC entity.
 */
export function addArc(model, entity) {
  model.arcs.push(entity);
}

/**
 * Add a TEXT entity.
 */
export function addText(model, entity) {
  model.texts.push(entity);
}

/**
 * Add an INSERT entity.
 */
export function addInsert(model, entity) {
  model.inserts.push(entity);
}

/**
 * Add a POLYLINE or LWPOLYLINE entity.
 */
export function addPolyline(model, entity) {
  model.polylines.push(entity);
}

/**
 * Add a CIRCLE entity.
 */
export function addCircle(model, entity) {
  model.circles.push(entity);
}

/**
 * Add an unsupported or unrecognised entity to the model.
 */
export function addUnsupported(model, entity) {
  model.unsupported.push(entity);
}