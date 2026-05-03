/*
 * formats/dxf/dxf-to-ceg.js
 *
 * Maps a RawDXFModel into a Canonical Edit Graph (CEG).  Each DXF
 * entity type is translated into one or more components and
 * anchors.  Unsupported entities generate proxy components and
 * update the lossContract.  This adapter does not perform any
 * editing; it creates a fresh CEG instance populated with
 * components and anchors.
 */

import { createCanonicalEditGraph } from '../../core/ceg/canonical-edit-graph.js';
import { createComponent } from '../../core/ceg/canonical-component.js';
import { createAnchor } from '../../core/ceg/canonical-anchor.js';
import { defaultCapabilities } from '../../core/ceg/capabilities.js';
import { buildLayerMap } from './dxf-layer-resolver.js';

// Utility to generate unique anchor IDs
let anchorCounter = 0;
function nextAnchorId(prefix = 'a') {
  anchorCounter += 1;
  return `${prefix}${anchorCounter}`;
}

// Utility to generate unique component IDs
let compCounter = 0;
function nextComponentId(prefix = 'comp') {
  compCounter += 1;
  return `${prefix}${compCounter}`;
}

/**
 * Convert a raw DXF model into a Canonical Edit Graph.  For each
 * entity in the raw model the adapter will create canonical
 * components and anchors.  Layers are recorded on the graph’s
 * `layers` map.  Unsupported entities become proxy components
 * recorded in the lossContract.
 *
 * @param {Object} rawModel Raw DXF model.
 * @param {Object} [options] Optional settings (unused for now).
 * @returns {Object} A new CEG instance.
 */
export function dxfToCeg(rawModel, options = {}) {
  const graph = createCanonicalEditGraph({ sourceFormat: 'DXF' });
  // Build layer map
  const layers = buildLayerMap(rawModel);
  graph.layers = layers;
  // Process LINE entities
  for (const line of rawModel.lines) {
    const id = `DXF_LINE_${line.handle || nextComponentId('line')}`;
    const a1Id = nextAnchorId(`${line.handle || id}_ep1_`);
    const a2Id = nextAnchorId(`${line.handle || id}_ep2_`);
    const a1 = createAnchor({ id: a1Id, role: 'EP1', point: { x: line.x1 || 0, y: line.y1 || 0, z: line.z1 || 0 } });
    const a2 = createAnchor({ id: a2Id, role: 'EP2', point: { x: line.x2 || 0, y: line.y2 || 0, z: line.z2 || 0 } });
    graph.anchors[a1Id] = a1;
    graph.anchors[a2Id] = a2;
    const comp = createComponent({
      id,
      type: 'LINE',
      layerId: line.layer || 'default',
      anchorIds: [a1Id, a2Id],
      geometryRole: 'LINEAR',
      attributes: {},
      rawAttributes: {},
      derived: {},
      capabilities: defaultCapabilities('LINE'),
      sourceRef: {
        format: 'DXF',
        handle: line.handle || null,
        entityType: 'LINE',
        layer: line.layer || null
      }
    });
    graph.components[id] = comp;
  }
  // Process ARC entities
  for (const arc of rawModel.arcs) {
    const id = `DXF_ARC_${arc.handle || nextComponentId('arc')}`;
    // Compute endpoints using centre, radius and angles if available
    const cx = arc.cx || 0;
    const cy = arc.cy || 0;
    const cz = arc.cz || 0;
    const radius = arc.radius || 0;
    const start = typeof arc.startAngle === 'number' ? arc.startAngle : 0;
    const end = typeof arc.endAngle === 'number' ? arc.endAngle : 0;
    const rad = (angle) => (angle * Math.PI) / 180;
    const ep1 = {
      x: cx + radius * Math.cos(rad(start)),
      y: cy + radius * Math.sin(rad(start)),
      z: cz
    };
    const ep2 = {
      x: cx + radius * Math.cos(rad(end)),
      y: cy + radius * Math.sin(rad(end)),
      z: cz
    };
    const cp = { x: cx, y: cy, z: cz };
    const aCpId = nextAnchorId(`${arc.handle || id}_cp_`);
    const a1Id = nextAnchorId(`${arc.handle || id}_ep1_`);
    const a2Id = nextAnchorId(`${arc.handle || id}_ep2_`);
    graph.anchors[aCpId] = createAnchor({ id: aCpId, role: 'CP', point: cp });
    graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: ep1 });
    graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: ep2 });
    const comp = createComponent({
      id,
      type: 'ARC',
      layerId: arc.layer || 'default',
      anchorIds: [a1Id, aCpId, a2Id],
      geometryRole: 'CURVE',
      attributes: {},
      rawAttributes: {},
      derived: { radius },
      capabilities: defaultCapabilities('ARC'),
      sourceRef: {
        format: 'DXF',
        handle: arc.handle || null,
        entityType: 'ARC',
        layer: arc.layer || null
      }
    });
    graph.components[id] = comp;
  }
  // Process TEXT entities
  for (const txt of rawModel.texts) {
    const id = `DXF_TEXT_${txt.handle || nextComponentId('txt')}`;
    const aId = nextAnchorId(`${txt.handle || id}_origin_`);
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: txt.x || 0, y: txt.y || 0, z: txt.z || 0 } });
    const comp = createComponent({
      id,
      type: 'ANNOTATION',
      layerId: txt.layer || 'default',
      anchorIds: [aId],
      geometryRole: 'POINT',
      attributes: { text: txt.text || '' },
      rawAttributes: {},
      derived: {},
      capabilities: { canMove: true, canDelete: true, canStretch: false, canExtend: false, canExportDXF: true, canExportGLB: true },
      sourceRef: {
        format: 'DXF',
        handle: txt.handle || null,
        entityType: 'TEXT',
        layer: txt.layer || null
      }
    });
    graph.components[id] = comp;
  }
  // Process CIRCLE (map to ARC with full circle)
  for (const circ of rawModel.circles) {
    const id = `DXF_CIRCLE_${circ.handle || nextComponentId('circle')}`;
    const cx = circ.cx || 0;
    const cy = circ.cy || 0;
    const cz = circ.cz || 0;
    const radius = circ.radius || 0;
    const aCpId = nextAnchorId(`${circ.handle || id}_cp_`);
    const a1Id = nextAnchorId(`${circ.handle || id}_ep1_`);
    const a2Id = nextAnchorId(`${circ.handle || id}_ep2_`);
    // We'll pick arbitrary start (0 deg) and end (180 deg) for full circle representation
    graph.anchors[aCpId] = createAnchor({ id: aCpId, role: 'CP', point: { x: cx, y: cy, z: cz } });
    graph.anchors[a1Id] = createAnchor({ id: a1Id, role: 'EP1', point: { x: cx + radius, y: cy, z: cz } });
    graph.anchors[a2Id] = createAnchor({ id: a2Id, role: 'EP2', point: { x: cx - radius, y: cy, z: cz } });
    const comp = createComponent({
      id,
      type: 'ARC',
      layerId: circ.layer || 'default',
      anchorIds: [a1Id, aCpId, a2Id],
      geometryRole: 'CURVE',
      attributes: {},
      rawAttributes: {},
      derived: { radius },
      capabilities: defaultCapabilities('ARC'),
      sourceRef: {
        format: 'DXF',
        handle: circ.handle || null,
        entityType: 'CIRCLE',
        layer: circ.layer || null
      }
    });
    graph.components[id] = comp;
  }
  // Process INSERT entities into block components
  for (const ins of rawModel.inserts) {
    // Many inserts may not have explicit position in our parser; use x,y,z if present or 0
    const id = `DXF_INSERT_${ins.handle || nextComponentId('blk')}`;
    const aId = nextAnchorId(`${ins.handle || id}_origin_`);
    const x = typeof ins.x === 'number' ? ins.x : 0;
    const y = typeof ins.y === 'number' ? ins.y : 0;
    const z = typeof ins.z === 'number' ? ins.z : 0;
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x, y, z } });
    const comp = createComponent({
      id,
      type: 'BLOCK_COMPONENT',
      layerId: ins.layer || 'default',
      anchorIds: [aId],
      geometryRole: 'POINT',
      attributes: { blockName: ins.blockName || null },
      rawAttributes: {},
      derived: {},
      capabilities: defaultCapabilities('BLOCK_COMPONENT'),
      sourceRef: {
        format: 'DXF',
        handle: ins.handle || null,
        entityType: 'INSERT',
        layer: ins.layer || null,
        blockName: ins.blockName || null
      }
    });
    graph.components[id] = comp;
  }
  // Process POLYLINE/LWPOLYLINE entities.  We conservatively map each polyline
  // to a proxy entity because the parser does not capture all vertices.
  for (const pl of rawModel.polylines) {
    const id = `DXF_POLYLINE_${pl.handle || nextComponentId('pline')}`;
    const aId = nextAnchorId(`${pl.handle || id}_origin_`);
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: 0, y: 0, z: 0 } });
    const comp = createComponent({
      id,
      type: 'PROXY_DXF_ENTITY',
      layerId: pl.layer || 'default',
      anchorIds: [aId],
      geometryRole: 'UNKNOWN',
      attributes: {},
      rawAttributes: {},
      derived: {},
      capabilities: defaultCapabilities('PROXY_DXF_ENTITY'),
      sourceRef: {
        format: 'DXF',
        handle: pl.handle || null,
        entityType: pl.type || 'POLYLINE',
        layer: pl.layer || null
      }
    });
    graph.components[id] = comp;
    // Record this proxy both as an unsupported entity and as a proxy.  Some
    // downstream consumers differentiate proxy entities from other loss types.
    // Always push to both lists to avoid omitting either record.
    graph.lossContract.unsupportedEntities.push({ type: pl.type || 'POLYLINE', handle: pl.handle || null });
    if (!graph.lossContract.proxyEntities) {
      graph.lossContract.proxyEntities = [];
    }
    graph.lossContract.proxyEntities.push({ id, type: pl.type || 'POLYLINE', handle: pl.handle || null });
  }
  // Process unsupported entities as proxies
  for (const unk of rawModel.unsupported) {
    const id = `DXF_PROXY_${unk.handle || nextComponentId('proxy')}`;
    const aId = nextAnchorId(`${unk.handle || id}_origin_`);
    graph.anchors[aId] = createAnchor({ id: aId, role: 'ORIGIN', point: { x: 0, y: 0, z: 0 } });
    const comp = createComponent({
      id,
      type: 'PROXY_DXF_ENTITY',
      layerId: unk.layer || 'default',
      anchorIds: [aId],
      geometryRole: 'UNKNOWN',
      attributes: {},
      rawAttributes: {},
      derived: {},
      capabilities: defaultCapabilities('PROXY_DXF_ENTITY'),
      sourceRef: {
        format: 'DXF',
        handle: unk.handle || null,
        entityType: unk.type || 'UNKNOWN',
        layer: unk.layer || null
      }
    });
    graph.components[id] = comp;
    // Record loss contract entry
    graph.lossContract.unsupportedEntities.push({ type: unk.type || 'UNKNOWN', handle: unk.handle || null });
    if (!graph.lossContract.proxyEntities) {
      graph.lossContract.proxyEntities = [];
    }
    graph.lossContract.proxyEntities.push({ id, type: unk.type || 'UNKNOWN', handle: unk.handle || null });
  }
  return graph;
}