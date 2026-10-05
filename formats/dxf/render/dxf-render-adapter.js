/**
 * formats/dxf/render/dxf-render-adapter.js
 *
 * Primary CAD Render Projection Adapter.
 * Projects authoritative DxfDocument entities into a high-fidelity RenderModel
 * carrying stable source identifiers (sourceEntityId), exact CAD coordinates,
 * resolved ACI/TrueColor styles, recursive block transforms, and text geometry.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { resolveEntityStyle, resolveLayerStyle } from './dxf-style-resolver.js';
import { projectBlockInstance, transformPoint } from './dxf-block-renderer.js';
import { projectTextPrimitive } from './dxf-text-renderer.js';

import { projectEntity } from './dxf-entity-projector.js';
import {
  RenderModel,
  sampleBulgeArc,
  sampleArc,
  sampleCircle,
  sampleEllipse,
  sampleSpline,
} from './dxf-geometry-sampler.js';

export class DxfRenderAdapter {
  /**
   * Projects a DxfDocument into a unified RenderModel.
   *
   * @param {import('../model/dxf-document.js').DxfDocument} document
   * @param {Object} [options]
   * @param {boolean} [options.includePaperSpace=false]
   * @param {boolean} [options.includeInvisible=false]
   * @param {number} [options.arcSegments=36]
   * @param {number} [options.splineSegments=32]
   * @param {number} [options.maxBlockDepth=16]
   * @returns {RenderModel}
   */
  static buildRenderModel(document, options = {}) {
    if (!document) {
      return new RenderModel();
    }

    const diagnostics = [];
    const primitives = [];
    const primitivesByEntityId = new Map();
    const primitivesByLayer = new Map();

    const includePaperSpace = Boolean(options.includePaperSpace);
    const includeInvisible = Boolean(options.includeInvisible);
    const arcSegments = options.arcSegments || 36;
    const splineSegments = options.splineSegments || 32;
    const maxBlockDepth = options.maxBlockDepth || 16;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const stats = {
      totalPrimitives: 0,
      lines: 0,
      arcs: 0,
      circles: 0,
      polylines: 0,
      texts: 0,
      splines: 0,
      ellipses: 0,
      solids: 0,
      leaders: 0,
      dimensions: 0,
      points: 0,
      hatches: 0,
      blocksExpanded: 0,
      invisibleFiltered: 0,
    };

    function updateBounds(pt) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const x = pt.x;
      const y = pt.y;
      const z = Number.isFinite(pt.z) ? pt.z : 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    function addPrimitive(prim) {
      if (!prim) return;
      if (!includeInvisible && prim.style?.visible === false) {
        stats.invisibleFiltered++;
        return;
      }

      primitives.push(prim);
      stats.totalPrimitives++;

      // Index by source entity ID (e.g. 'dxf:entity:A12B')
      const eid = prim.sourceEntityId;
      if (eid) {
        let list = primitivesByEntityId.get(eid);
        if (!list) {
          list = [];
          primitivesByEntityId.set(eid, list);
        }
        list.push(prim);
      }

      // Index by layer (upper case)
      const lName = String(prim.layer || '0').trim().toUpperCase();
      let layerList = primitivesByLayer.get(lName);
      if (!layerList) {
        layerList = [];
        primitivesByLayer.set(lName, layerList);
      }
      layerList.push(prim);

      // Accumulate bounds from primitive points or coordinates
      if (Array.isArray(prim.points)) {
        for (const p of prim.points) updateBounds(p);
      }
      if (prim.start) updateBounds(prim.start);
      if (prim.end) updateBounds(prim.end);
      if (prim.position) updateBounds(prim.position);
      if (prim.bounds?.corners) {
        for (const c of prim.bounds.corners) updateBounds(c);
      }
    }

    // Helper to project individual entity record

    // Process all authoritative model entities in order
    const entities = Array.isArray(document.entities) ? document.entities : [];

    for (const entity of entities) {
      if (!entity) continue;

      // Filter paper space entities if requested
      if (!includePaperSpace && entity.space === 'paper') {
        continue;
      }

      const style = resolveEntityStyle(entity, document);
      projectEntity(entity, style, null, null, { addPrimitive, stats, document, arcSegments, splineSegments, maxBlockDepth, diagnostics });

    }

    // Summarize layer metadata
    const layers = [];
    if (document.tables?.layers instanceof Map) {
      for (const [name, layer] of document.tables.layers.entries()) {
        const resolved = resolveLayerStyle(layer);
        const prims = primitivesByLayer.get(name.toUpperCase()) || [];
        layers.push({
          ...resolved,
          primitiveCount: prims.length,
        });
      }
    }

    // Compute bounding box dimensions
    const hasBounds = Number.isFinite(minX) && Number.isFinite(maxX);
    const bounds = {
      min: hasBounds ? { x: minX, y: minY, z: minZ } : { x: 0, y: 0, z: 0 },
      max: hasBounds ? { x: maxX, y: maxY, z: maxZ } : { x: 0, y: 0, z: 0 },
      size: hasBounds
        ? { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
        : { x: 0, y: 0, z: 0 },
      center: hasBounds
        ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
        : { x: 0, y: 0, z: 0 },
    };

    return new RenderModel({
      sourceDocument: {
        documentId: document.id,
        revision: document.revision,
        fileName: document.source?.fileName || 'untitled.dxf',
        acadVersion: document.source?.acadVersion || 'AC1015',
        entityCount: entities.length,
        layerCount: document.tables?.layers?.size || 0,
        blockCount: document.blocks?.size || 0,
      },
      bounds,
      primitives,
      primitivesByEntityId,
      primitivesByLayer,
      layers,
      stats,
      diagnostics,
    });
  }
}
