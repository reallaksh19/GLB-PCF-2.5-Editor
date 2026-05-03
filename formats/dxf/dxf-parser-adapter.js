/*
 * formats/dxf/dxf-parser-adapter.js  (browser build)
 *
 * Parses a DXF text string into a RawDXFModel using the 'dxf-parser'
 * CDN library (already declared in the import-map in index.html).
 * This adapter replaces the Node.js version from the update package
 * which used 'fs'.  The output shape is identical so dxf-to-ceg.js
 * consumes it unchanged.
 *
 * Field mapping from dxf-parser → RawDXFModel entity:
 *   LINE    → { x1,y1,z1, x2,y2,z2, layer, handle }
 *   ARC     → { cx,cy,cz, radius, startAngle,endAngle, layer, handle }
 *   CIRCLE  → { cx,cy,cz, radius, layer, handle }
 *   TEXT    → { x,y,z, text, layer, handle }
 *   INSERT  → { x,y,z, blockName, layer, handle }
 *   LWPOLYLINE/POLYLINE → polylines list (proxy only)
 *   anything else → unsupported list
 */

import DxfParser from 'dxf-parser';
import {
  createRawDxfModel,
  addLine, addArc, addText, addInsert, addPolyline, addCircle, addUnsupported
} from './dxf-raw-model.js';

/**
 * Parse a DXF string into a RawDXFModel.
 *
 * @param {string} dxfText  Raw DXF file contents.
 * @returns {Object} RawDXFModel ready for dxfToCeg().
 */
export function parseDxfToRawModel(dxfText) {
  if (typeof dxfText !== 'string') {
    throw new TypeError('parseDxfToRawModel expects a DXF string');
  }

  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(dxfText);
  } catch (err) {
    throw new Error(`DXF parse failed: ${err.message}`);
  }

  const model    = createRawDxfModel();
  const entities = dxf?.entities || [];

  for (const ent of entities) {
    const handle = ent.handle  || null;
    const layer  = ent.layer   || 'default';

    switch (ent.type) {
      case 'LINE': {
        // dxf-parser exposes vertices[0] and vertices[1]
        const v = ent.vertices || [];
        addLine(model, {
          type: 'LINE', handle, layer,
          x1: v[0]?.x ?? 0, y1: v[0]?.y ?? 0, z1: v[0]?.z ?? 0,
          x2: v[1]?.x ?? 0, y2: v[1]?.y ?? 0, z2: v[1]?.z ?? 0,
        });
        break;
      }
      case 'ARC':
        addArc(model, {
          type: 'ARC', handle, layer,
          cx: ent.center?.x ?? 0,
          cy: ent.center?.y ?? 0,
          cz: ent.center?.z ?? 0,
          radius:     ent.radius     ?? 0,
          startAngle: ent.startAngle ?? 0,  // dxf-parser gives radians
          endAngle:   ent.endAngle   ?? 0,
        });
        break;
      case 'CIRCLE':
        addCircle(model, {
          type: 'CIRCLE', handle, layer,
          cx: ent.center?.x ?? 0,
          cy: ent.center?.y ?? 0,
          cz: ent.center?.z ?? 0,
          radius: ent.radius ?? 0,
        });
        break;
      case 'TEXT':
      case 'MTEXT':
        addText(model, {
          type: ent.type, handle, layer,
          x: ent.startPoint?.x ?? ent.position?.x ?? 0,
          y: ent.startPoint?.y ?? ent.position?.y ?? 0,
          z: ent.startPoint?.z ?? ent.position?.z ?? 0,
          text: ent.text || '',
        });
        break;
      case 'INSERT':
        addInsert(model, {
          type: 'INSERT', handle, layer,
          x: ent.position?.x ?? 0,
          y: ent.position?.y ?? 0,
          z: ent.position?.z ?? 0,
          blockName: ent.name || null,
        });
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE':
        addPolyline(model, { type: ent.type, handle, layer });
        break;
      default:
        addUnsupported(model, { type: ent.type, handle, layer });
        break;
    }
  }

  return model;
}
