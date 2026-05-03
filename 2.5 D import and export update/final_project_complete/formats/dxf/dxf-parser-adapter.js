/*
 * formats/dxf/dxf-parser-adapter.js
 *
 * Converts a DXF file string into a RawDXFModel.  This adapter
 * performs a coarse parse of DXF group codes sufficient for
 * extracting common entity types (LINE, ARC, TEXT, LWPOLYLINE,
 * POLYLINE, INSERT, CIRCLE).  Unsupported entities are collected
 * for diagnostics.  The resulting RawDXFModel is consumed by
 * dxf‑to‑ceg.js to build the Canonical Edit Graph.
 */

import { createRawDxfModel, addLine, addArc, addText, addInsert, addPolyline, addCircle, addUnsupported } from './dxf-raw-model.js';
import fs from 'fs';

/**
 * Parse a DXF file (string or Buffer or path) into a raw model.
 * The parser reads group codes sequentially and populates entity
 * objects.  It is intentionally permissive: unknown group codes
 * are ignored and unsupported entities are recorded for later
 * diagnostics.
 *
 * @param {string|Buffer} input DXF data or file path.
 * @returns {Object} Raw DXF model.
 */
export function parseDxfToRawModel(input) {
  let data;
  if (Buffer.isBuffer(input)) {
    data = input.toString('utf8');
  } else if (typeof input === 'string') {
    // Attempt to read from file if it exists
    try {
      if (fs.existsSync(input) && fs.statSync(input).isFile()) {
        data = fs.readFileSync(input, 'utf8');
      } else {
        data = input;
      }
    } catch (e) {
      data = input;
    }
  } else {
    throw new TypeError('parseDxfToRawModel expects a string or Buffer');
  }
  // Split into lines on newline.  DXF uses CR/LF or LF; treat both.
  const lines = data.split(/\r?\n/);
  const model = createRawDxfModel();
  let i = 0;
  let currentEntity = null;
  const newEntity = (type) => {
    return {
      type,
      handle: null,
      layer: null,
      // Group code properties vary by type; we will attach
      // coordinates under property names (x1,y1,z1,x2,y2,z2,cp, radius,
      // startAngle,endAngle etc.) as needed.
    };
  };
  const pushCurrent = () => {
    if (!currentEntity) return;
    const ent = currentEntity;
    switch (ent.type) {
      case 'LINE':
        addLine(model, ent);
        break;
      case 'ARC':
        addArc(model, ent);
        break;
      case 'TEXT':
        addText(model, ent);
        break;
      case 'INSERT':
        addInsert(model, ent);
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE':
        addPolyline(model, ent);
        break;
      case 'CIRCLE':
        addCircle(model, ent);
        break;
      default:
        addUnsupported(model, ent);
        break;
    }
    currentEntity = null;
  };
  while (i < lines.length) {
    const code = lines[i++].trim();
    const value = (i < lines.length ? lines[i++].trim() : '');
    // Start of new entity
    if (code === '0') {
      // Push previous entity
      if (currentEntity) {
        pushCurrent();
      }
      // Section boundaries are not entities
      if (value === 'SECTION' || value === 'ENDSEC' || value === 'ENDTAB' || value === 'TABLE' || value === 'TABLES' || value === 'HEADER' || value === 'LAYER' || value === 'EOF') {
        // no current entity to start
        currentEntity = null;
        continue;
      }
      // Create new entity record
      currentEntity = newEntity(value);
      continue;
    }
    if (!currentEntity) {
      continue;
    }
    // Group code interpretation
    switch (code) {
      case '5':
        currentEntity.handle = value;
        break;
      case '8':
        currentEntity.layer = value;
        break;
      case '2':
        // Block name or symbol name for INSERT entities
        // We record this on all entity types for context; it will
        // be ignored for unsupported types.
        currentEntity.blockName = value;
        break;
      case '10':
        // X coordinate of first point or centre
        if (currentEntity.type === 'ARC' || currentEntity.type === 'CIRCLE') {
          currentEntity.cx = parseFloat(value);
        } else if (currentEntity.type === 'TEXT' || currentEntity.type === 'INSERT') {
          currentEntity.x = parseFloat(value);
        } else {
          currentEntity.x1 = parseFloat(value);
        }
        break;
      case '20':
        if (currentEntity.type === 'ARC' || currentEntity.type === 'CIRCLE') {
          currentEntity.cy = parseFloat(value);
        } else if (currentEntity.type === 'TEXT' || currentEntity.type === 'INSERT') {
          currentEntity.y = parseFloat(value);
        } else {
          currentEntity.y1 = parseFloat(value);
        }
        break;
      case '30':
        if (currentEntity.type === 'ARC' || currentEntity.type === 'CIRCLE') {
          currentEntity.cz = parseFloat(value);
        } else if (currentEntity.type === 'TEXT' || currentEntity.type === 'INSERT') {
          currentEntity.z = parseFloat(value);
        } else {
          currentEntity.z1 = parseFloat(value);
        }
        break;
      case '11':
        currentEntity.x2 = parseFloat(value);
        break;
      case '21':
        currentEntity.y2 = parseFloat(value);
        break;
      case '31':
        currentEntity.z2 = parseFloat(value);
        break;
      case '40':
        // radius or height
        currentEntity.radius = parseFloat(value);
        currentEntity.height = parseFloat(value);
        break;
      case '50':
        currentEntity.startAngle = parseFloat(value);
        break;
      case '51':
        currentEntity.endAngle = parseFloat(value);
        break;
      case '1':
        // text content
        currentEntity.text = value;
        break;
      default:
        // Ignore other codes for now
        break;
    }
  }
  // Push final entity
  if (currentEntity) {
    pushCurrent();
  }
  return model;
}