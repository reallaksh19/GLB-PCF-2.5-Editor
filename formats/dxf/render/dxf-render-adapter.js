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

export class RenderModel {
  constructor(params = {}) {
    this.version = '1.0.0';
    this.sourceFormat = 'DXF';
    this.sourceDocument = params.sourceDocument || null;
    this.bounds = params.bounds || {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
    };
    this.primitives = params.primitives || [];
    this.primitivesByEntityId = params.primitivesByEntityId || new Map();
    this.primitivesByLayer = params.primitivesByLayer || new Map();
    this.layers = params.layers || [];
    this.stats = params.stats || {};
  }

  /**
   * Look up all render primitives projected for a source entity handle or ID.
   * @param {string} sourceEntityId - e.g. 'dxf:entity:A12B'
   * @returns {Array<Object>}
   */
  getPrimitivesForEntity(sourceEntityId) {
    if (!sourceEntityId) return [];
    return this.primitivesByEntityId.get(String(sourceEntityId)) || [];
  }

  /**
   * Look up all render primitives belonging to a given layer name.
   * @param {string} layerName
   * @returns {Array<Object>}
   */
  getPrimitivesForLayer(layerName) {
    if (!layerName) return [];
    return this.primitivesByLayer.get(String(layerName).trim().toUpperCase()) || [];
  }
}

/**
 * Generate tessellated points along an arc segment between two vertices with a given bulge.
 * Accurately places center and sagitta in DXF coordinates (positive bulge curves left of chord).
 */
export function sampleBulgeArc(p1, p2, bulge, maxSegments = 32) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-9) {
    return [
      { x: p1.x ?? 0, y: p1.y ?? 0, z: p1.z ?? 0 },
      { x: p2.x ?? 0, y: p2.y ?? 0, z: p2.z ?? 0 },
    ];
  }

  const dx = (p2.x ?? 0) - (p1.x ?? 0);
  const dy = (p2.y ?? 0) - (p1.y ?? 0);
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < 1e-9) {
    return [{ x: p1.x ?? 0, y: p1.y ?? 0, z: p1.z ?? 0 }];
  }

  // Left unit normal
  const nx = -dy / chord;
  const ny = dx / chord;

  // Center distance from chord midpoint
  const d = (chord * (1 - b * b)) / (4 * b);
  const cx = ((p1.x ?? 0) + (p2.x ?? 0)) / 2 - nx * d;
  const cy = ((p1.y ?? 0) + (p2.y ?? 0)) / 2 - ny * d;
  const cz = p1.z ?? 0;
  const radius = Math.abs((chord * (1 + b * b)) / (4 * b));

  const startAngle = Math.atan2((p1.y ?? 0) - cy, (p1.x ?? 0) - cx);
  const sweep = -4 * Math.atan(b); // angle delta around center

  const segments = Math.max(4, Math.min(maxSegments, Math.ceil((Math.abs(sweep) / Math.PI) * 16)));
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ang = startAngle + t * sweep;
    const z = (p1.z ?? 0) + t * ((p2.z ?? 0) - (p1.z ?? 0));
    points.push({
      x: cx + radius * Math.cos(ang),
      y: cy + radius * Math.sin(ang),
      z,
    });
  }

  return points;
}

/**
 * Generate tessellated points along an ARC entity (always counter-clockwise in DXF).
 */
export function sampleArc(center, radius, startAngleDeg, endAngleDeg, segments = 32) {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const cz = center?.z ?? 0;
  const r = Math.max(0, radius ?? 0);

  const startRad = ((startAngleDeg || 0) * Math.PI) / 180;
  const endRad = ((endAngleDeg || 0) * Math.PI) / 180;

  let sweep = endRad - startRad;
  if (sweep <= 0) sweep += 2 * Math.PI;

  const count = Math.max(4, Math.min(segments, Math.ceil((sweep / Math.PI) * 16)));
  const points = [];

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const ang = startRad + t * sweep;
    points.push({
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      z: cz,
    });
  }

  return points;
}

/**
 * Generate tessellated points along a 360-degree CIRCLE.
 */
export function sampleCircle(center, radius, segments = 36) {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const cz = center?.z ?? 0;
  const r = Math.max(0, radius ?? 0);

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const ang = (i / segments) * 2 * Math.PI;
    points.push({
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      z: cz,
    });
  }
  return points;
}

/**
 * Generate tessellated points along an ELLIPSE entity.
 */
export function sampleEllipse(center, majorAxis, ratio, startParam = 0, endParam = 2 * Math.PI, segments = 36) {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const cz = center?.z ?? 0;

  const mx = majorAxis?.x ?? 1;
  const my = majorAxis?.y ?? 0;
  const mz = majorAxis?.z ?? 0;
  const majorLen = Math.sqrt(mx * mx + my * my + mz * mz);

  if (majorLen < 1e-9) {
    return [{ x: cx, y: cy, z: cz }];
  }

  const r = Math.min(1.0, Math.max(1e-6, Number(ratio) || 1.0));
  // Perpendicular vector for minor axis
  const nx = -my / majorLen;
  const ny = mx / majorLen;
  const minorLen = majorLen * r;

  let sweep = (endParam ?? 2 * Math.PI) - (startParam ?? 0);
  if (sweep <= 0) sweep += 2 * Math.PI;

  const count = Math.max(8, segments);
  const points = [];

  for (let i = 0; i <= count; i++) {
    const t = (startParam ?? 0) + (i / count) * sweep;
    const cos = Math.cos(t);
    const sin = Math.sin(t);

    points.push({
      x: cx + mx * cos + nx * minorLen * sin,
      y: cy + my * cos + ny * minorLen * sin,
      z: cz + mz * cos,
    });
  }

  return points;
}

/**
 * Generate interpolated points along a SPLINE.
 */
export function sampleSpline(pointsList, closed = false, segments = 32) {
  const pts = Array.isArray(pointsList) ? pointsList.filter(Boolean) : [];
  if (pts.length < 2) return pts;
  if (pts.length === 2) return pts;

  // Catmull-Rom spline interpolation through control/fit points
  const result = [];
  const n = pts.length;
  const count = closed ? n : n - 1;
  const stepsPerSpan = Math.max(4, Math.floor(segments / count));

  for (let i = 0; i < count; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : (i === 0 ? pts[0] : pts[i - 1]);
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = closed ? pts[(i + 2) % n] : (i + 2 < n ? pts[i + 2] : p2);

    for (let s = 0; s < stepsPerSpan; s++) {
      const t = s / stepsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom basis matrix (tension = 0.5)
      const q0 = -0.5 * t3 + t2 - 0.5 * t;
      const q1 = 1.5 * t3 - 2.5 * t2 + 1.0;
      const q2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
      const q3 = 0.5 * t3 - 0.5 * t2;

      result.push({
        x: p0.x * q0 + p1.x * q1 + p2.x * q2 + p3.x * q3,
        y: p0.y * q0 + p1.y * q1 + p2.y * q2 + p3.y * q3,
        z: (p0.z || 0) * q0 + (p1.z || 0) * q1 + (p2.z || 0) * q2 + (p3.z || 0) * q3,
      });
    }
  }

  result.push(closed ? result[0] : pts[pts.length - 1]);
  return result;
}

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
    function projectEntity(entity, style, transform, blockContext) {
      const sourceEntityId = blockContext
        ? `dxf:entity:${blockContext.insertHandle}`
        : (entity.id || `dxf:entity:${entity.handle || 'temp'}`);

      const basePoint = blockContext?.basePoint;

      switch (entity.type) {
        case 'LINE': {
          const rawStart = entity.geometry?.start || { x: 0, y: 0, z: 0 };
          const rawEnd = entity.geometry?.end || { x: 0, y: 0, z: 0 };
          const start = transform ? transformPoint(rawStart, transform, basePoint) : { ...rawStart };
          const end = transform ? transformPoint(rawEnd, transform, basePoint) : { ...rawEnd };

          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const dz = (end.z || 0) - (start.z || 0);
          const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

          stats.lines++;
          addPrimitive({
            type: 'line',
            id: `render:${entity.handle || 'line'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            start,
            end,
            length,
            points: [start, end],
            blockContext: blockContext || null,
          });
          break;
        }

        case 'ARC': {
          const rawCenter = entity.geometry?.center || { x: 0, y: 0, z: 0 };
          const center = transform ? transformPoint(rawCenter, transform, basePoint) : { ...rawCenter };
          const scaleFactor = transform ? (Math.abs(transform.scale.x) + Math.abs(transform.scale.y)) / 2 : 1;
          const radius = (entity.geometry?.radius || 0) * scaleFactor;

          const rotOffsetDeg = transform ? transform.rotationDeg : 0;
          const startAngle = (entity.geometry?.startAngle || 0) + rotOffsetDeg;
          const endAngle = (entity.geometry?.endAngle || 0) + rotOffsetDeg;

          const points = sampleArc(center, radius, startAngle, endAngle, arcSegments);
          const startPoint = points[0] || center;
          const endPoint = points[points.length - 1] || center;

          stats.arcs++;
          addPrimitive({
            type: 'arc',
            id: `render:${entity.handle || 'arc'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            center,
            radius,
            startAngle,
            endAngle,
            clockwise: false,
            startPoint,
            endPoint,
            points,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'CIRCLE': {
          const rawCenter = entity.geometry?.center || { x: 0, y: 0, z: 0 };
          const center = transform ? transformPoint(rawCenter, transform, basePoint) : { ...rawCenter };
          const scaleFactor = transform ? (Math.abs(transform.scale.x) + Math.abs(transform.scale.y)) / 2 : 1;
          const radius = (entity.geometry?.radius || 0) * scaleFactor;

          const points = sampleCircle(center, radius, arcSegments);

          stats.circles++;
          addPrimitive({
            type: 'circle',
            id: `render:${entity.handle || 'circle'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            center,
            radius,
            points,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const rawVertices = Array.isArray(entity.geometry?.vertices) ? entity.geometry.vertices : [];
          if (rawVertices.length < 2) break;

          const transformedVertices = rawVertices.map((v) => {
            const pt = transform ? transformPoint(v, transform, basePoint) : { ...v };
            return {
              x: pt.x,
              y: pt.y,
              z: pt.z ?? v.z ?? 0,
              bulge: Number(v.bulge) || 0,
            };
          });

          const closed = Boolean(entity.geometry?.closed);
          const count = closed ? transformedVertices.length : transformedVertices.length - 1;
          const allPoints = [];
          const segments = [];

          for (let i = 0; i < count; i++) {
            const v1 = transformedVertices[i];
            const v2 = transformedVertices[(i + 1) % transformedVertices.length];
            const bulge = v1.bulge || 0;

            if (Math.abs(bulge) > 1e-9) {
              const arcPts = sampleBulgeArc(v1, v2, bulge, arcSegments);
              segments.push({ type: 'arc', bulge, points: arcPts });
              if (allPoints.length === 0) {
                allPoints.push(...arcPts);
              } else {
                allPoints.push(...arcPts.slice(1));
              }
            } else {
              segments.push({ type: 'line', bulge: 0, points: [v1, v2] });
              if (allPoints.length === 0) {
                allPoints.push(v1, v2);
              } else {
                allPoints.push(v2);
              }
            }
          }

          stats.polylines++;
          addPrimitive({
            type: 'polyline',
            id: `render:${entity.handle || 'polyline'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            vertices: transformedVertices,
            segments,
            points: allPoints,
            closed,
            is3D: Boolean(entity.geometry?.is3D),
            blockContext: blockContext || null,
          });
          break;
        }

        case 'TEXT':
        case 'MTEXT': {
          stats.texts++;
          const textPrim = projectTextPrimitive(entity, style, transform, blockContext);
          addPrimitive(textPrim);
          break;
        }

        case 'SPLINE': {
          const controlPoints = (entity.geometry?.controlPoints || []).map((cp) =>
            transform ? transformPoint(cp, transform, basePoint) : { ...cp }
          );
          const fitPoints = (entity.geometry?.fitPoints || []).map((fp) =>
            transform ? transformPoint(fp, transform, basePoint) : { ...fp }
          );

          const basisPoints = fitPoints.length >= 2 ? fitPoints : controlPoints;
          const closed = Boolean(entity.attributes?.flags & 1);
          const points = sampleSpline(basisPoints, closed, splineSegments);

          stats.splines++;
          addPrimitive({
            type: 'spline',
            id: `render:${entity.handle || 'spline'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            controlPoints,
            fitPoints,
            degree: entity.geometry?.degree || 3,
            closed,
            points,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'ELLIPSE': {
          const rawCenter = entity.geometry?.center || { x: 0, y: 0, z: 0 };
          const center = transform ? transformPoint(rawCenter, transform, basePoint) : { ...rawCenter };
          const rawMajor = entity.geometry?.majorAxis || { x: 1, y: 0, z: 0 };

          let majorAxis = rawMajor;
          if (transform) {
            const rotCos = transform.cos;
            const rotSin = transform.sin;
            const sx = transform.scale.x;
            const sy = transform.scale.y;
            majorAxis = {
              x: (rawMajor.x * sx) * rotCos - (rawMajor.y * sy) * rotSin,
              y: (rawMajor.x * sx) * rotSin + (rawMajor.y * sy) * rotCos,
              z: rawMajor.z * (transform.scale.z || 1),
            };
          }

          const ratio = entity.geometry?.ratio || 1.0;
          const startParam = entity.geometry?.startParam || 0;
          const endParam = entity.geometry?.endParam || 2 * Math.PI;

          const points = sampleEllipse(center, majorAxis, ratio, startParam, endParam, arcSegments);

          stats.ellipses++;
          addPrimitive({
            type: 'ellipse',
            id: `render:${entity.handle || 'ellipse'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            center,
            majorAxis,
            ratio,
            startParam,
            endParam,
            points,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'SOLID':
        case '3DFACE': {
          const rawPoints = Array.isArray(entity.geometry?.points) ? entity.geometry.points : [];
          if (rawPoints.length < 3) break;

          const points = rawPoints.map((p) =>
            transform ? transformPoint(p, transform, basePoint) : { ...p }
          );

          // AutoCAD SOLID quads have crossed points: p1, p2, p4, p3
          const p1 = points[0] || { x: 0, y: 0, z: 0 };
          const p2 = points[1] || { x: 0, y: 0, z: 0 };
          const p3 = points[2] || { x: 0, y: 0, z: 0 };
          const p4 = points[3] || p3;

          const isQuad = points.length >= 4 && (p4.x !== p3.x || p4.y !== p3.y || p4.z !== p3.z);
          const triangles = isQuad
            ? [[p1, p2, p4], [p1, p4, p3]]
            : [[p1, p2, p3]];

          const outlinePoints = isQuad ? [p1, p2, p4, p3, p1] : [p1, p2, p3, p1];

          stats.solids++;
          addPrimitive({
            type: 'solid',
            id: `render:${entity.handle || 'solid'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            vertices: points,
            triangles,
            points: outlinePoints,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'LEADER': {
          const rawVertices = Array.isArray(entity.geometry?.vertices) ? entity.geometry.vertices : [];
          if (rawVertices.length < 2) break;

          const points = rawVertices.map((v) =>
            transform ? transformPoint(v, transform, basePoint) : { ...v }
          );

          // Generate arrow head at vertex 0 pointing from vertex 1
          const p0 = points[0];
          const p1 = points[1];
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          let arrow = null;
          if (len > 1e-6) {
            const arrowLen = Math.min(len * 0.3, 2.5);
            const ux = dx / len;
            const uy = dy / len;
            const vx = -uy;
            const vy = ux;

            const arrowBase = { x: p0.x + ux * arrowLen, y: p0.y + uy * arrowLen, z: p0.z || 0 };
            const wingW = arrowLen * 0.35;
            arrow = {
              tip: p0,
              left: { x: arrowBase.x + vx * wingW, y: arrowBase.y + vy * wingW, z: p0.z || 0 },
              right: { x: arrowBase.x - vx * wingW, y: arrowBase.y - vy * wingW, z: p0.z || 0 },
            };
          }

          stats.leaders++;
          addPrimitive({
            type: 'leader',
            id: `render:${entity.handle || 'leader'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            vertices: points,
            points,
            arrow,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'DIMENSION': {
          stats.dimensions++;
          const blockName = entity.attributes?.blockName;
          const dimBlock = blockName ? document.getBlock(blockName) : null;

          if (dimBlock && Array.isArray(dimBlock.entities) && dimBlock.entities.length > 0) {
            // AutoCAD pre-rendered anonymous dimension block (*D...)
            const dimPrimitives = [];
            projectBlockInstance(
              entity,
              document,
              { depth: blockContext ? blockContext.depth : 0, maxBlockDepth, parentTransform: transform },
              (childEntity, childStyle, composedTransform, bCtx) => {
                projectEntity(childEntity, childStyle, composedTransform, {
                  ...bCtx,
                  insertHandle: entity.handle || 'DIMENSION',
                });
              }
            );
          } else {
            // Synthesize dimension lines from definition points (p10, p11, p13, p14)
            const dp = entity.geometry?.defPoints || {};
            const p10 = dp.p10 ? (transform ? transformPoint(dp.p10, transform, basePoint) : dp.p10) : null;
            const p11 = dp.p11 ? (transform ? transformPoint(dp.p11, transform, basePoint) : dp.p11) : null;
            const p13 = dp.p13 ? (transform ? transformPoint(dp.p13, transform, basePoint) : dp.p13) : null;
            const p14 = dp.p14 ? (transform ? transformPoint(dp.p14, transform, basePoint) : dp.p14) : null;

            const dimPoints = [p13, p14, p10, p11].filter(Boolean);

            addPrimitive({
              type: 'dimension',
              id: `render:${entity.handle || 'dim'}:${blockContext ? blockContext.depth : 0}`,
              sourceEntityId,
              layer: style.layerName,
              style,
              text: entity.attributes?.text || '',
              dimType: entity.attributes?.dimType || 0,
              defPoints: { p10, p11, p13, p14 },
              points: dimPoints,
              blockContext: blockContext || null,
            });
          }
          break;
        }

        case 'POINT': {
          const rawPoint = entity.geometry?.point || { x: 0, y: 0, z: 0 };
          const position = transform ? transformPoint(rawPoint, transform, basePoint) : { ...rawPoint };

          stats.points++;
          addPrimitive({
            type: 'point',
            id: `render:${entity.handle || 'point'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            position,
            points: [position],
            blockContext: blockContext || null,
          });
          break;
        }

        case 'HATCH': {
          stats.hatches++;
          const boundaryPoints = [];
          if (Array.isArray(entity.geometry?.boundaries)) {
            for (const b of entity.geometry.boundaries) {
              if (Array.isArray(b.points)) {
                boundaryPoints.push(
                  ...b.points.map((p) => (transform ? transformPoint(p, transform, basePoint) : { ...p }))
                );
              }
            }
          }

          addPrimitive({
            type: 'hatch',
            id: `render:${entity.handle || 'hatch'}:${blockContext ? blockContext.depth : 0}`,
            sourceEntityId,
            layer: style.layerName,
            style,
            pattern: entity.attributes?.patternName || 'SOLID',
            isSolid: Boolean(entity.attributes?.isSolid),
            points: boundaryPoints,
            blockContext: blockContext || null,
          });
          break;
        }

        case 'INSERT': {
          // INSERT entities expand their block definitions
          stats.blocksExpanded++;
          projectBlockInstance(
            entity,
            document,
            { depth: 0, maxBlockDepth, parentTransform: transform },
            (childEntity, childStyle, composedTransform, bCtx) => {
              projectEntity(childEntity, childStyle, composedTransform, bCtx);
            }
          );
          break;
        }

        default: {
          // Unknown or unspecialized entity: pass through point or points if present
          if (entity.geometry?.point) {
            const position = transform ? transformPoint(entity.geometry.point, transform, basePoint) : entity.geometry.point;
            addPrimitive({
              type: 'unknown',
              originalType: entity.type,
              id: `render:${entity.handle || 'unknown'}:${blockContext ? blockContext.depth : 0}`,
              sourceEntityId,
              layer: style.layerName,
              style,
              position,
              points: [position],
              blockContext: blockContext || null,
            });
          }
          break;
        }
      }
    }

    // Process all authoritative model entities in order
    const entities = Array.isArray(document.entities) ? document.entities : [];

    for (const entity of entities) {
      if (!entity) continue;

      // Filter paper space entities if requested
      if (!includePaperSpace && entity.space === 'paper') {
        continue;
      }

      const style = resolveEntityStyle(entity, document);
      projectEntity(entity, style, null, null);
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
    });
  }
}
