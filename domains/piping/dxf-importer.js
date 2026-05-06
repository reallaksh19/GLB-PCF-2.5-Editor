import DxfParser from 'dxf-parser';
import { parseDxfToRawModel } from '../../formats/dxf/dxf-parser-adapter.js';
import { dxfToCeg }           from '../../formats/dxf/dxf-to-ceg.js';
import { graphToGenericComponents } from '../../core/geometry/geometry-view.js';
import { expandCurveEntityToSegments, hasPolylineBulges } from '../../formats/dxf/dxf-curve-utils.js';
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

function logEntityWarn(log, code, ent, extra = {}) {
  log.warn(code, {
    ...dxfEntitySource(ent),
    ...extra,
  });
}

function updateBounds(bounds, pt) {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) return;
  bounds.min.x = Math.min(bounds.min.x, pt.x);
  bounds.min.y = Math.min(bounds.min.y, pt.y);
  bounds.min.z = Math.min(bounds.min.z, pt.z);
  bounds.max.x = Math.max(bounds.max.x, pt.x);
  bounds.max.y = Math.max(bounds.max.y, pt.y);
  bounds.max.z = Math.max(bounds.max.z, pt.z);
  bounds.count += 1;
}

function boundsSummary(bounds) {
  if (!bounds.count) return null;
  return {
    min: bounds.min,
    max: bounds.max,
    size: {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
    },
  };
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
  const fidelity = {
    bulgePolylineCount: 0,
    splineApproximationCount: 0,
    insertBlockCount: 0,
    curveChordCount: 0,
  };
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
    count: 0,
  };
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
        updateBounds(bounds, ent.ep1);
        updateBounds(bounds, ent.ep2);
        components.push(makeComponent(localId++, 'PIPE', {
          ep1: ent.ep1,
          ep2: ent.ep2,
        }, attributes, { source }));
        continue;
      }

      if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE' || ent.type === 'SPLINE') {
        if (hasPolylineBulges(ent.vertices)) fidelity.bulgePolylineCount += 1;
        if (ent.type === 'SPLINE') fidelity.splineApproximationCount += 1;
        const segments = expandCurveEntityToSegments(ent, {
          toleranceMm: 25,
          maxSegmentLengthMm: 500,
        });
        if (!segments.length) {
          logEntityWarn(log, 'DXF_ENTITY_INVALID', ent, { reason: `${ent.type}_HAS_NO_NON_ZERO_SEGMENTS` });
          warnCount += 1;
          skippedCount += 1;
          continue;
        }

        for (const seg of segments) {
          updateBounds(bounds, seg.ep1);
          updateBounds(bounds, seg.ep2);
          if (seg.approximatedFrom) fidelity.curveChordCount += 1;
          components.push(makeComponent(localId++, 'PIPE', {
            ep1: seg.ep1,
            ep2: seg.ep2,
          }, attributes, {
            source,
            downgradedFrom: ent.type,
            segmentIndex: seg.segmentIndex,
            chordIndex: seg.chordIndex ?? null,
            approximatedFrom: seg.approximatedFrom || null,
            bulge: seg.bulge ?? null,
          }));
        }
        downgradedCount += 1;
        continue;
      }

      if (ent.type === 'ARC') {
        const r = ent.radius;
        const ep1 = {
          x: ent.center.x + r * Math.cos(ent.startAngle),
          y: ent.center.y + r * Math.sin(ent.startAngle),
          z: ent.center.z,
        };
        const ep2 = {
          x: ent.center.x + r * Math.cos(ent.endAngle),
          y: ent.center.y + r * Math.sin(ent.endAngle),
          z: ent.center.z,
        };
        updateBounds(bounds, ep1);
        updateBounds(bounds, ep2);
        updateBounds(bounds, ent.center);
        components.push(makeComponent(localId++, 'ELBOW', {
          cp: ent.center,
          ep1,
          ep2,
        }, attributes, { source }));
        continue;
      }

      if (ent.type === 'CIRCLE') {
        updateBounds(bounds, { x: ent.center.x - ent.radius, y: ent.center.y - ent.radius, z: ent.center.z });
        updateBounds(bounds, { x: ent.center.x + ent.radius, y: ent.center.y + ent.radius, z: ent.center.z });
        components.push(makeComponent(localId++, 'FLANGE', {
          origin: ent.center,
          bore: ent.radius * 2,
        }, attributes, { source }));
        continue;
      }

      if (ent.type === 'INSERT') {
        fidelity.insertBlockCount += 1;
        const bn = String(ent.blockName || '').toUpperCase();
        let type = 'FITTING';
        if (bn.includes('VALVE')) type = 'VALVE';
        else if (bn.includes('SUPPORT')) type = 'SUPPORT';
        else if (bn.includes('TEE')) type = 'TEE';

        updateBounds(bounds, ent.position);
        components.push(makeComponent(localId++, type, {
          origin: ent.position,
          size: { w: 100, h: 100, d: 100 },
        }, attributes, {
          source,
          blockName: ent.blockName || null,
          rotation: ent.rotation,
          scale: ent.scale,
          warning: 'BLOCK_NOT_EXPANDED_PLACEHOLDER_RENDERED',
        }));
        logEntityWarn(log, 'DXF_INSERT_PLACEHOLDER', ent, {
          blockName: ent.blockName || null,
          reason: 'Block definition expansion pending; placeholder keeps insertion visible',
        });
        warnCount += 1;
        continue;
      }

      if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        updateBounds(bounds, ent.textAnchor);
        components.push(makeComponent(localId++, 'MESSAGE-SQUARE', {
          origin: ent.textAnchor,
        }, attributes, {
          source,
          squareText: ent.text,
          squarePos: ent.textAnchor,
        }));
        continue;
      }

      if (ent.type === 'POINT') {
        const origin = ent.position || ent.textAnchor || { x: 0, y: 0, z: 0 };
        updateBounds(bounds, origin);
        components.push(makeComponent(localId++, 'FITTING', {
          origin,
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
    fidelity,
    extents: boundsSummary(bounds),
  });

  if (fidelity.bulgePolylineCount || fidelity.splineApproximationCount || fidelity.insertBlockCount) {
    log.warn('DXF_VISUAL_FIDELITY_APPROXIMATION', fidelity);
  }

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
  let components = [];
  let ceg = null;
  try {
    const rawModel = parseDxfToRawModel(text);
    ceg = dxfToCeg(rawModel);
    ceg.document.name = 'DXF Import';
    components = graphToGenericComponents(ceg);
    log.info('DXF_CEG_DERIVE_DONE', {
      componentCount: components.length,
      anchorCount: Object.keys(ceg.anchors || {}).length,
      cegComponentCount: Object.keys(ceg.components || {}).length,
    });
  } catch (err) {
    log.warn('CEG_BUILD_WARN', { message: String(err?.message || err) });
    components = parseDxf(text, log);
  }
  return { components, ceg };
}
