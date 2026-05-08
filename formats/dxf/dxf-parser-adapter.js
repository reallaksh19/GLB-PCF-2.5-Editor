/*
 * formats/dxf/dxf-parser-adapter.js  (browser build)
 *
 * Parses a DXF text string into a RawDXFModel using the 'dxf-parser'
 * CDN library (already declared in the import-map in index.html).
 * The adapter normalizes parser-specific entity shapes before producing the
 * RawDXFModel consumed by dxf-to-ceg.js.
 *
 * Field mapping from normalized DXF entity → RawDXFModel entity:
 *   LINE    → { x1,y1,z1, x2,y2,z2, layer, handle }
 *   ARC     → { cx,cy,cz, radius, startAngle,endAngle, layer, handle }
 *   CIRCLE  → { cx,cy,cz, radius, layer, handle }
 *   TEXT    → { x,y,z, text, layer, handle }
 *   INSERT  → { x,y,z, blockName, layer, handle }
 *   LWPOLYLINE/POLYLINE → polylines list with vertices preserved
 *   SPLINE  → guides list with control/fit points preserved
 *   BLOCK definitions → model.blocks, then expanded from INSERTs
 *   anything else → unsupported list
 */

import DxfParser from 'dxf-parser';
import {
  createRawDxfModel,
  addLine, addArc, addText, addInsert, addPolyline, addCircle, addGuide, addUnsupported,
  addBlockDefinition,
} from './dxf-raw-model.js';
import { expandAllInserts } from './dxf-block-expander.js';
import { resolveDxfUnits, scalePointToMm, scaleLengthToMm } from './dxf-units.js';
import { computeDxfBounds, extractHeaderExtents, compareDxfExtents } from './dxf-bounds.js';
import { prepareDxfViewMetadata } from './dxf-view-prepare.js';
import { normalizeLayerTable, resolveEntityStyle } from './dxf-style.js';
import {
  dxfEntitySource,
  getDxfEntityIssue,
  normalizeDxfEntity,
} from './dxf-entity-normalizer.js';

function blockBasePoint(block = {}) {
  return block.basePoint
    || block.position
    || block.origin
    || block.insertionPoint
    || { x: block.x || 0, y: block.y || 0, z: block.z || 0 };
}

function normalizeBlockDefinitions(model, dxf) {
  const blocks = dxf?.blocks || {};
  if (!blocks || typeof blocks !== 'object') return;

  for (const [name, block] of Object.entries(blocks)) {
    if (!block || typeof block !== 'object') continue;
    const entities = Array.isArray(block.entities) ? block.entities : [];
    addBlockDefinition(model, block.name || name, {
      name: block.name || name,
      entities,
      basePoint: blockBasePoint(block),
      raw: block,
    });
  }
}

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
  model.header = dxf?.header || {};
  model.units = resolveDxfUnits(model.header);
  model.layerTable = normalizeLayerTable(dxf);
  model.headerExtents = extractHeaderExtents(model.header, model.units.mmPerUnit);
  normalizeBlockDefinitions(model, dxf);
  const entities = dxf?.entities || [];

  for (let index = 0; index < entities.length; index += 1) {
    const ent = normalizeDxfEntity(entities[index], index);
    const handle = ent.handle;
    const layer = ent.layer || 'default';
    const dxfStyle = resolveEntityStyle(ent.raw || ent, model.layerTable);
    const issue = getDxfEntityIssue(ent);

    if (issue) {
      addUnsupported(model, {
        ...dxfEntitySource(ent),
        type: ent.type,
        handle,
        layer,
        reason: issue,
      });
      continue;
    }

    switch (ent.type) {
      case 'LINE': {
        const ep1 = scalePointToMm(ent.ep1, model.units.mmPerUnit);
        const ep2 = scalePointToMm(ent.ep2, model.units.mmPerUnit);
        addLine(model, {
          type: 'LINE', handle, layer,
          x1: ep1.x, y1: ep1.y, z1: ep1.z,
          x2: ep2.x, y2: ep2.y, z2: ep2.z,
          sourceUnits: model.units,
          dxfStyle,
        });
        break;
      }
      case 'ARC': {
        const c = scalePointToMm(ent.center, model.units.mmPerUnit);
        addArc(model, {
          type: 'ARC', handle, layer,
          cx: c.x,
          cy: c.y,
          cz: c.z,
          radius: scaleLengthToMm(ent.radius, model.units.mmPerUnit),
          startAngle: ent.startAngle,
          endAngle: ent.endAngle,
          sourceUnits: model.units,
          dxfStyle,
        });
        break;
      }
      case 'CIRCLE': {
        const c = scalePointToMm(ent.center, model.units.mmPerUnit);
        addCircle(model, {
          type: 'CIRCLE', handle, layer,
          cx: c.x,
          cy: c.y,
          cz: c.z,
          radius: scaleLengthToMm(ent.radius, model.units.mmPerUnit),
          sourceUnits: model.units,
          dxfStyle,
        });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const p = scalePointToMm(ent.textAnchor, model.units.mmPerUnit);
        addText(model, {
          type: ent.type, handle, layer,
          x: p.x,
          y: p.y,
          z: p.z,
          text: ent.text || '',
          sourceUnits: model.units,
          dxfStyle,
        });
        break;
      }
      case 'INSERT': {
        const p = scalePointToMm(ent.position, model.units.mmPerUnit);
        addInsert(model, {
          type: 'INSERT',
          handle,
          layer,
          x: p.x,
          y: p.y,
          z: p.z,
          position: p,
          blockName: ent.blockName || null,
          raw: ent.raw || {},
          rotation: ent.raw?.rotation ?? ent.raw?.rotationAngle ?? 0,
          xScale: ent.raw?.xScale ?? ent.raw?.scaleX ?? ent.raw?.scale?.x ?? 1,
          yScale: ent.raw?.yScale ?? ent.raw?.scaleY ?? ent.raw?.scale?.y ?? 1,
          zScale: ent.raw?.zScale ?? ent.raw?.scaleZ ?? ent.raw?.scale?.z ?? 1,
          sourceUnits: model.units,
          dxfStyle,
        });
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE':
        addPolyline(model, {
          type: ent.type,
          handle,
          layer,
          vertices: ent.vertices.map((v) => scalePointToMm(v, model.units.mmPerUnit)),
          closed: Boolean(ent.raw?.closed || ent.raw?.shape || ent.raw?.isClosed),
          sourceUnits: model.units,
        });
        break;
      case 'SPLINE':
        addGuide(model, {
          type: 'SPLINE',
          handle,
          layer,
          points: ent.vertices.map((v) => scalePointToMm(v, model.units.mmPerUnit)),
          sourcePointType: ent.raw?.fitPoints?.length ? 'FIT' : 'CONTROL',
          sourceUnits: model.units,
        });
        break;
      default:
        addUnsupported(model, { type: ent.type, handle, layer });
        break;
    }
  }

  expandAllInserts(model);
  model.computedBounds = computeDxfBounds(model);
  compareDxfExtents(model);
  prepareDxfViewMetadata(model);
  return model;
}
