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
import { expandCurveEntityToSegments } from './dxf-curve-utils.js';

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
    attributes: {}, rawAttributes: {}, derived: {
      approximatedFrom: input.approximatedFrom || null,
      bulge: input.bulge ?? null,
    },
    capabilities: defaultCapabilities('LINE'),
    sourceRef: {
      format: 'DXF',
      handle: input.handle,
      entityType: input.entityType || 'LINE',
      layer: input.layer || null,
      segmentIndex: input.segmentIndex ?? null,
      chordIndex: input.chordIndex ?? null,
      downgradedFrom: input.downgradedFrom || null,
    }
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
    const id   = `DXF_ARC_${arc.handle || nextCompId('arc')}`;
    const { cx = 0, cy = 0, cz = 0, radius = 0 } = arc;
    const ep1  = { x: cx + radius * Math.cos(arc.startAngle ?? 0), y: cy + radius * Math.sin(arc.startAngle ?? 0), z: cz };
    const ep2  = { x: cx + radius * Math.cos(arc.endAngle   ?? 0), y: cy + radius * Math.sin(arc.endAngle   ?? 0), z: cz };
    const cp   = { x: cx, y: cy, z: cz };
    const cpId = nextAnchorId(`${arc.handle || id}_cp_`);
    const a1Id = nextAnchorId(`${arc.handle || id}_ep1_`);
    const a2Id = nextAnchorId(`${arc.handle || id}_ep2_`);
    graph.anchors[cpId] = createAnchor({ id: cpId, role: 'CP',  point: cp  });
    graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: ep1 });
    graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: ep2 });
    graph.components[id] = createComponent({
      id, type: 'ARC', layerId: arc.layer || 'default',
      anchorIds: [a1Id, cpId, a2Id], geometryRole: 'CURVE',
      attributes: {}, rawAttributes: {}, derived: { radius },
      capabilities: defaultCapabilities('ARC'),
      sourceRef: { format: 'DXF', handle: arc.handle, entityType: 'ARC', layer: arc.layer || null }
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

  // ── CIRCLE entities (mapped to closed ARC) ─────────────────────────────
  for (const circ of rawModel.circles) {
    const id   = `DXF_CIRCLE_${circ.handle || nextCompId('circle')}`;
    const { cx = 0, cy = 0, cz = 0, radius = 0 } = circ;
    const cpId = nextAnchorId(`${circ.handle || id}_cp_`);
    const a1Id = nextAnchorId(`${circ.handle || id}_ep1_`);
    const a2Id = nextAnchorId(`${circ.handle || id}_ep2_`);
    graph.anchors[cpId] = createAnchor({ id: cpId, role: 'CP',  point: { x: cx, y: cy, z: cz } });
    graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: { x: cx + radius, y: cy, z: cz } });
    graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: { x: cx - radius, y: cy, z: cz } });
    graph.components[id] = createComponent({
      id, type: 'ARC', layerId: circ.layer || 'default',
      anchorIds: [a1Id, cpId, a2Id], geometryRole: 'CURVE',
      attributes: {}, rawAttributes: {}, derived: { radius, closed: true },
      capabilities: defaultCapabilities('ARC'),
      sourceRef: { format: 'DXF', handle: circ.handle, entityType: 'CIRCLE', layer: circ.layer || null }
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
      attributes: { blockName: ins.blockName || null }, rawAttributes: {}, derived: {
        rotation: ins.rotation || 0,
        scale: ins.scale || { x: 1, y: 1, z: 1 },
        warning: 'BLOCK_NOT_EXPANDED_PLACEHOLDER_RENDERED',
      },
      capabilities: defaultCapabilities('BLOCK_COMPONENT'),
      sourceRef: { format: 'DXF', handle: ins.handle, entityType: 'INSERT', layer: ins.layer || null, blockName: ins.blockName || null }
    });
    graph.lossContract.downgradedEntities.push({
      type: 'INSERT',
      handle: ins.handle || null,
      to: 'BLOCK_PLACEHOLDER',
      reason: 'BLOCK_EXPANSION_PENDING',
    });
  }

  // ── POLYLINE/SPLINE entities ───────────────────────────────────────────
  for (const pl of rawModel.polylines) {
    const segments = expandCurveEntityToSegments(pl, options);
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

    for (const seg of segments) {
      addLineComponent(graph, {
        id: `DXF_POLYLINE_${pl.handle || nextCompId('pline')}_SEG_${seg.segmentIndex}_${seg.chordIndex ?? 0}`,
        handle: pl.handle,
        layer: pl.layer || 'default',
        entityType: 'LINE',
        downgradedFrom: pl.type || 'POLYLINE',
        segmentIndex: seg.segmentIndex,
        chordIndex: seg.chordIndex ?? null,
        approximatedFrom: seg.approximatedFrom || null,
        bulge: seg.bulge ?? null,
        x1: seg.ep1.x,
        y1: seg.ep1.y,
        z1: seg.ep1.z,
        x2: seg.ep2.x,
        y2: seg.ep2.y,
        z2: seg.ep2.z,
      });
    }
    graph.lossContract.downgradedEntities.push({
      type: pl.type || 'POLYLINE',
      handle: pl.handle || null,
      to: 'LINE_SEGMENTS',
      segmentCount: segments.length,
      hasCurveApproximation: segments.some((seg) => !!seg.approximatedFrom),
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
