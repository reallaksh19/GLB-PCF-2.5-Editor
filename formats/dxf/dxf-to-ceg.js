/*
 * formats/dxf/dxf-to-ceg.js
 *
 * Maps a RawDXFModel (from dxf-parser-adapter) into a Canonical Edit Graph.
 * Each supported entity type becomes components + anchors.
 * Unsupported/proxy entities are recorded in lossContract.
 */

import { createCanonicalEditGraph } from '../../core/ceg/canonical-edit-graph.js';
import { createComponent }          from '../../core/ceg/canonical-component.js';
import { createAnchor }             from '../../core/ceg/canonical-anchor.js';
import { defaultCapabilities }      from '../../core/ceg/capabilities.js';
import { buildLayerMap }            from './dxf-layer-resolver.js';
import { expandPolylineSegments }   from './dxf-bulge-utils.js';

let anchorCounter = 0;
let compCounter   = 0;
function nextAnchorId(prefix = 'a') { return `${prefix}${++anchorCounter}`; }
function nextCompId(prefix = 'comp') { return `${prefix}${++compCounter}`; }

function addLineComponent(graph, input) {
  const id  = input.id || `DXF_LINE_${input.handle || nextCompId('line')}`;
  const a1Id = nextAnchorId(`${input.handle || id}_ep1_`);
  const a2Id = nextAnchorId(`${input.handle || id}_ep2_`);
  graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: { x: input.x1 ?? 0, y: input.y1 ?? 0, z: input.z1 ?? 0 } });
  graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: { x: input.x2 ?? 0, y: input.y2 ?? 0, z: input.z2 ?? 0 } });
  graph.components[id] = createComponent({
    id, type: 'LINE', layerId: input.layer || 'default',
    anchorIds: [a1Id, a2Id], geometryRole: 'LINEAR',
    attributes: {}, rawAttributes: {}, derived: {},
    capabilities: defaultCapabilities('LINE'),
    sourceRef: {
      format: 'DXF',
      handle: input.handle,
      entityType: input.entityType || 'LINE',
      layer: input.layer || null,
      segmentIndex: input.segmentIndex ?? null,
      downgradedFrom: input.downgradedFrom || null,
    }
  });
  return id;
}

function addArcComponent(graph, input) {
  const id = input.id || `DXF_ARC_${input.handle || nextCompId('arc')}`;
  const cpId = nextAnchorId(`${input.handle || id}_cp_`);
  const a1Id = nextAnchorId(`${input.handle || id}_ep1_`);
  const a2Id = nextAnchorId(`${input.handle || id}_ep2_`);
  graph.anchors[cpId] = createAnchor({ id: cpId, role: 'CP', point: input.cp });
  graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: input.ep1 });
  graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: input.ep2 });
  graph.components[id] = createComponent({
    id,
    type: 'ARC',
    layerId: input.layer || 'default',
    anchorIds: [a1Id, cpId, a2Id],
    geometryRole: 'CURVE',
    attributes: {},
    rawAttributes: {},
    derived: {
      radius: input.radius ?? null,
      bulge: input.bulge ?? null,
      clockwise: input.clockwise ?? null,
      startAngle: input.startAngle ?? null,
      endAngle: input.endAngle ?? null,
      closed: Boolean(input.closed),
    },
    capabilities: defaultCapabilities('ARC'),
    sourceRef: {
      format: 'DXF',
      handle: input.handle,
      entityType: input.entityType || 'ARC',
      layer: input.layer || null,
      segmentIndex: input.segmentIndex ?? null,
      downgradedFrom: input.downgradedFrom || null,
    }
  });
  return id;
}

function addGuideComponent(graph, input) {
  const id = input.id || `DXF_GUIDE_${input.handle || nextCompId('guide')}`;
  const points = Array.isArray(input.points) ? input.points.filter(Boolean) : [];
  const anchorIds = points.map((point, index) => {
    const role = input.sourcePointType === 'FIT' ? 'FIT_POINT' : 'CONTROL_POINT';
    const anchorId = nextAnchorId(`${input.handle || id}_pt${index}_`);
    graph.anchors[anchorId] = createAnchor({ id: anchorId, role, point });
    return anchorId;
  });
  graph.components[id] = createComponent({
    id,
    type: 'GUIDE',
    label: input.label || `${input.type || 'GUIDE'} ${input.handle || ''}`.trim(),
    layerId: input.layer || 'default',
    anchorIds,
    geometryRole: 'GUIDE_CURVE',
    attributes: { guideType: input.type || 'SPLINE', sourcePointType: input.sourcePointType || 'CONTROL' },
    rawAttributes: {},
    derived: { pointCount: points.length },
    capabilities: { canMove: true, canDelete: true, canStretch: true, canExtend: false, canExportDXF: true, canExportGLB: false },
    sourceRef: { format: 'DXF', handle: input.handle, entityType: input.type || 'SPLINE', layer: input.layer || null }
  });
  graph.lossContract.downgradedEntities.push({
    type: input.type || 'SPLINE',
    handle: input.handle || null,
    to: 'GUIDE_CURVE',
    pointCount: points.length,
  });
  return id;
}

/**
 * Convert a RawDXFModel into a Canonical Edit Graph.
 *
 * @param {Object} rawModel  Output of parseDxfToRawModel().
 * @param {Object} [options]
 * @returns {Object} A new CEG instance.
 */
export function dxfToCeg(rawModel, options = {}) {
  anchorCounter = 0;
  compCounter = 0;

  const graph     = createCanonicalEditGraph({ sourceFormat: 'DXF' });
  graph.layers    = buildLayerMap(rawModel);

  // ── LINE entities ──────────────────────────────────────────────────────
  for (const line of rawModel.lines) {
    addLineComponent(graph, line);
  }

  // ── ARC entities ───────────────────────────────────────────────────────
  for (const arc of rawModel.arcs) {
    const { cx = 0, cy = 0, cz = 0, radius = 0 } = arc;
    addArcComponent(graph, {
      id: `DXF_ARC_${arc.handle || nextCompId('arc')}`,
      handle: arc.handle,
      layer: arc.layer || 'default',
      entityType: 'ARC',
      cp: { x: cx, y: cy, z: cz },
      ep1: { x: cx + radius * Math.cos(arc.startAngle ?? 0), y: cy + radius * Math.sin(arc.startAngle ?? 0), z: cz },
      ep2: { x: cx + radius * Math.cos(arc.endAngle ?? 0), y: cy + radius * Math.sin(arc.endAngle ?? 0), z: cz },
      radius,
      startAngle: arc.startAngle ?? 0,
      endAngle: arc.endAngle ?? 0,
    });
  }

  // ── TEXT entities ──────────────────────────────────────────────────────
  for (const txt of rawModel.texts) {
    const id  = `DXF_TEXT_${txt.handle || nextCompId('txt')}`;
    const aId = nextAnchorId(`${txt.handle || id}_origin_`);
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: txt.x ?? 0, y: txt.y ?? 0, z: txt.z ?? 0 } });
    graph.components[id] = createComponent({
      id, type: 'ANNOTATION', layerId: txt.layer || 'default',
      anchorIds: [aId], geometryRole: 'POINT',
      attributes: { text: txt.text || '' }, rawAttributes: {}, derived: {},
      capabilities: { canMove: true, canDelete: true, canStretch: false, canExtend: false, canExportDXF: true, canExportGLB: true },
      sourceRef: { format: 'DXF', handle: txt.handle, entityType: txt.type || 'TEXT', layer: txt.layer || null }
    });
  }

  // ── CIRCLE entities ────────────────────────────────────────────────────
  for (const circ of rawModel.circles) {
    const id   = `DXF_CIRCLE_${circ.handle || nextCompId('circle')}`;
    const { cx = 0, cy = 0, cz = 0, radius = 0 } = circ;
    addArcComponent(graph, {
      id,
      handle: circ.handle,
      layer: circ.layer || 'default',
      entityType: 'CIRCLE',
      cp: { x: cx, y: cy, z: cz },
      ep1: { x: cx + radius, y: cy, z: cz },
      ep2: { x: cx + radius, y: cy, z: cz },
      radius,
      startAngle: 0,
      endAngle: Math.PI * 2,
      closed: true,
    });
  }

  // ── INSERT entities ────────────────────────────────────────────────────
  for (const ins of rawModel.inserts) {
    const id  = `DXF_INSERT_${ins.handle || nextCompId('blk')}`;
    const aId = nextAnchorId(`${ins.handle || id}_origin_`);
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: ins.x ?? 0, y: ins.y ?? 0, z: ins.z ?? 0 } });
    graph.components[id] = createComponent({
      id, type: 'BLOCK_COMPONENT', layerId: ins.layer || 'default',
      anchorIds: [aId], geometryRole: 'POINT',
      attributes: { blockName: ins.blockName || null }, rawAttributes: {}, derived: {},
      capabilities: defaultCapabilities('BLOCK_COMPONENT'),
      sourceRef: { format: 'DXF', handle: ins.handle, entityType: 'INSERT', layer: ins.layer || null, blockName: ins.blockName || null }
    });
  }

  // ── SPLINE / guide entities ────────────────────────────────────────────
  for (const guide of rawModel.guides || []) {
    addGuideComponent(graph, guide);
  }

  // ── POLYLINE entities ──────────────────────────────────────────────────
  // Fidelity fix: preserve DXF bulge arcs instead of forcing every polyline
  // span into a straight segment. Straight spans become LINE components; bulged
  // spans become ARC components with source metadata.
  for (const pl of rawModel.polylines) {
    const segments = expandPolylineSegments(pl);
    if (!segments.length) {
      const id  = `DXF_POLYLINE_${pl.handle || nextCompId('pline')}`;
      const aId = nextAnchorId(`${pl.handle || id}_origin_`);
      graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: 0, y: 0, z: 0 } });
      graph.components[id] = createComponent({
        id, type: 'PROXY_DXF_ENTITY', layerId: pl.layer || 'default',
        anchorIds: [aId], geometryRole: 'UNKNOWN',
        attributes: {}, rawAttributes: {}, derived: {},
        capabilities: defaultCapabilities('PROXY_DXF_ENTITY'),
        sourceRef: { format: 'DXF', handle: pl.handle, entityType: pl.type || 'POLYLINE', layer: pl.layer || null }
      });
      graph.lossContract.unsupportedEntities.push({ type: pl.type || 'POLYLINE', handle: pl.handle || null, reason: 'NO_VALID_SEGMENTS' });
      graph.lossContract.proxyEntities.push({ id, type: pl.type || 'POLYLINE', handle: pl.handle || null });
      continue;
    }

    let lineCount = 0;
    let arcCount = 0;
    for (const seg of segments) {
      if (seg.kind === 'ARC') {
        arcCount += 1;
        addArcComponent(graph, {
          id: `DXF_POLYLINE_${pl.handle || nextCompId('pline')}_ARC_${seg.segmentIndex}`,
          handle: pl.handle,
          layer: pl.layer || 'default',
          entityType: 'ARC',
          downgradedFrom: pl.type || 'POLYLINE',
          segmentIndex: seg.segmentIndex,
          ep1: seg.ep1,
          ep2: seg.ep2,
          cp: seg.cp,
          radius: seg.radius,
          bulge: seg.bulge,
          clockwise: seg.clockwise,
          startAngle: seg.startAngle,
          endAngle: seg.endAngle,
        });
      } else {
        lineCount += 1;
        addLineComponent(graph, {
          id: `DXF_POLYLINE_${pl.handle || nextCompId('pline')}_SEG_${seg.segmentIndex}`,
          handle: pl.handle,
          layer: pl.layer || 'default',
          entityType: 'LINE',
          downgradedFrom: pl.type || 'POLYLINE',
          segmentIndex: seg.segmentIndex,
          x1: seg.ep1.x,
          y1: seg.ep1.y,
          z1: seg.ep1.z,
          x2: seg.ep2.x,
          y2: seg.ep2.y,
          z2: seg.ep2.z,
        });
      }
    }
    graph.lossContract.downgradedEntities.push({
      type: pl.type || 'POLYLINE',
      handle: pl.handle || null,
      to: arcCount ? 'LINE_AND_ARC_SEGMENTS' : 'LINE_SEGMENTS',
      segmentCount: segments.length,
      lineCount,
      arcCount,
    });
  }

  // ── Unsupported entities (proxy) ───────────────────────────────────────
  for (const unk of rawModel.unsupported) {
    const id  = `DXF_PROXY_${unk.handle || nextCompId('proxy')}`;
    const aId = nextAnchorId(`${unk.handle || id}_origin_`);
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: 0, y: 0, z: 0 } });
    graph.components[id] = createComponent({
      id, type: 'PROXY_DXF_ENTITY', layerId: unk.layer || 'default',
      anchorIds: [aId], geometryRole: 'UNKNOWN',
      attributes: {}, rawAttributes: {}, derived: {},
      capabilities: defaultCapabilities('PROXY_DXF_ENTITY'),
      sourceRef: { format: 'DXF', handle: unk.handle, entityType: unk.type || 'UNKNOWN', layer: unk.layer || null, reason: unk.reason || null }
    });
    graph.lossContract.unsupportedEntities.push({ type: unk.type || 'UNKNOWN', handle: unk.handle || null, reason: unk.reason || null });
    graph.lossContract.proxyEntities.push({ id, type: unk.type || 'UNKNOWN', handle: unk.handle || null });
  }

  return graph;
}
