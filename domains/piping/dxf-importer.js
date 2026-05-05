import DxfParser from 'dxf-parser';
import { parseDxfToRawModel } from '../../formats/dxf/dxf-parser-adapter.js';
import { dxfToCeg }           from '../../formats/dxf/dxf-to-ceg.js';
import {
  dxfEntitySource,
  getDxfEntityIssue,
  normalizeDxfEntity,
} from '../../formats/dxf/dxf-entity-normalizer.js';

function AciToMaterial(aci) {
  switch (aci) {
    case 1: return 'CS';
    case 3: return 'SS';
    case 5: return 'CU';
    default: return 'UNKNOWN';
  }
}

function makeAttributes(ent) {
  return {
    'PIPELINE-REFERENCE': ent.layer || '0',
    'MATERIAL': AciToMaterial(ent.colorIndex || 256),
    'DXF-TYPE': ent.type,
    'DXF-HANDLE': ent.handle || '',
    'DXF-LAYER': ent.layer || '0',
  };
}

function makeComponent(localId, type, geometry, attributes, metadata = {}) {
  return {
    id: `DXF-${localId}`,
    type,
    attributes,
    geometry,
    metadata: {
      source: metadata.source || null,
      downgradedFrom: metadata.downgradedFrom || null,
      segmentIndex: metadata.segmentIndex ?? null,
      ...metadata,
    },
  };
}

function isZeroLength(a, b) {
  if (!a || !b) return true;
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const dz = (b.z ?? 0) - (a.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-9;
}

function polylineSegments(ent) {
  const vertices = [...(ent.vertices || [])];
  const closed = Boolean(ent.raw?.closed || ent.raw?.shape || ent.raw?.isClosed);
  if (closed && vertices.length > 2) vertices.push(vertices[0]);

  const segments = [];
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const ep1 = vertices[i];
    const ep2 = vertices[i + 1];
    if (isZeroLength(ep1, ep2)) continue;
    segments.push({ ep1, ep2, segmentIndex: i });
  }
  return segments;
}

function logEntityWarn(log, code, ent, extra = {}) {
  log.warn(code, {
    ...dxfEntitySource(ent),
    ...extra,
  });
}

export function parseDxf(text, log) {
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(text);
  } catch (err) {
    log.error('DXF_PARSE_FAIL', { message: err.message });
    return [];
  }

  const insunits = dxf.header?.$INSUNITS;
  if (insunits !== undefined && insunits !== 4) {
    log.warn('DXF_UNIT_WARN', { insunits });
  }

  const entities = dxf.entities || [];
  log.info('DXF_PARSE_START', { entityCount: entities.length });

  const components = [];
  const byType = {};
  let localId = 1;
  let warnCount = 0;
  let skippedCount = 0;
  let downgradedCount = 0;

  for (let index = 0; index < entities.length; index += 1) {
    const ent = normalizeDxfEntity(entities[index], index);
    byType[ent.type] = (byType[ent.type] || 0) + 1;

    const attributes = makeAttributes(ent);
    const source = dxfEntitySource(ent);
    const issue = getDxfEntityIssue(ent);

    if (issue) {
      logEntityWarn(log, 'DXF_ENTITY_INVALID', ent, { reason: issue });
      warnCount += 1;
      skippedCount += 1;
      continue;
    }

    try {
      if (ent.type === 'LINE') {
        components.push(makeComponent(localId++, 'PIPE', {
          ep1: ent.ep1,
          ep2: ent.ep2,
        }, attributes, { source }));
        continue;
      }

      if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        const segments = polylineSegments(ent);
        if (!segments.length) {
          logEntityWarn(log, 'DXF_ENTITY_INVALID', ent, { reason: 'POLYLINE_HAS_NO_NON_ZERO_SEGMENTS' });
          warnCount += 1;
          skippedCount += 1;
          continue;
        }

        for (const seg of segments) {
          components.push(makeComponent(localId++, 'PIPE', {
            ep1: seg.ep1,
            ep2: seg.ep2,
          }, attributes, {
            source,
            downgradedFrom: ent.type,
            segmentIndex: seg.segmentIndex,
          }));
        }
        downgradedCount += 1;
        continue;
      }

      if (ent.type === 'ARC') {
        const r = ent.radius;
        components.push(makeComponent(localId++, 'ELBOW', {
          cp: ent.center,
          ep1: {
            x: ent.center.x + r * Math.cos(ent.startAngle),
            y: ent.center.y + r * Math.sin(ent.startAngle),
            z: ent.center.z,
          },
          ep2: {
            x: ent.center.x + r * Math.cos(ent.endAngle),
            y: ent.center.y + r * Math.sin(ent.endAngle),
            z: ent.center.z,
          },
        }, attributes, { source }));
        continue;
      }

      if (ent.type === 'CIRCLE') {
        components.push(makeComponent(localId++, 'FLANGE', {
          origin: ent.center,
          bore: ent.radius * 2,
        }, attributes, { source }));
        continue;
      }

      if (ent.type === 'INSERT') {
        const bn = String(ent.blockName || '').toUpperCase();
        let type = 'FITTING';
        if (bn.includes('VALVE')) type = 'VALVE';
        else if (bn.includes('SUPPORT')) type = 'SUPPORT';
        else if (bn.includes('TEE')) type = 'TEE';

        components.push(makeComponent(localId++, type, {
          origin: ent.position,
        }, attributes, { source, blockName: ent.blockName || null }));
        continue;
      }

      if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        components.push(makeComponent(localId++, 'MESSAGE-SQUARE', {}, attributes, {
          source,
          squareText: ent.text,
          squarePos: ent.textAnchor,
        }));
        continue;
      }

      if (ent.type === 'POINT') {
        components.push(makeComponent(localId++, 'FITTING', {
          origin: ent.position || ent.textAnchor || { x: 0, y: 0, z: 0 },
        }, attributes, { source }));
        continue;
      }

      logEntityWarn(log, 'DXF_ENTITY_SKIP', ent, { reason: 'Unsupported' });
      warnCount += 1;
      skippedCount += 1;
    } catch (err) {
      logEntityWarn(log, 'DXF_ENTITY_IMPORT_FAIL', ent, { message: String(err?.message || err) });
      warnCount += 1;
      skippedCount += 1;
    }
  }

  log.info('DXF_PARSE_DONE', {
    componentCount: components.length,
    entityCount: entities.length,
    warnCount,
    skippedCount,
    downgradedCount,
    entityTypes: byType,
  });

  if (components.length > 0) {
    import('../../js/capabilities/capability-registry.js').then(({ capabilities }) => {
      capabilities.ready('dxf-import');
    }).catch(() => {});
  }

  return components;
}

/**
 * Parse a DXF string and return both the component array (for the existing
 * renderer pipeline) and a Canonical Edit Graph (for the CEG pipeline).
 *
 * @param {string} text DXF file contents.
 * @param {Object} log  AppLogger instance.
 * @returns {{ components: Array, ceg: Object }}
 */
export function parseDxfWithCeg(text, log) {
  const components = parseDxf(text, log);
  let ceg = null;
  try {
    const rawModel = parseDxfToRawModel(text);
    ceg = dxfToCeg(rawModel);
    ceg.document.name = 'DXF Import';
  } catch (err) {
    log.warn('CEG_BUILD_WARN', { message: String(err?.message || err) });
  }
  return { components, ceg };
}
