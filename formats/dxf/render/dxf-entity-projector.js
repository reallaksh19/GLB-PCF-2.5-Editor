import { projectBlockInstance, transformPoint } from './dxf-block-renderer.js';
import { projectTextPrimitive } from './dxf-text-renderer.js';
import { sampleBulgeArc, sampleArc, sampleCircle, sampleEllipse, sampleSpline } from './dxf-geometry-sampler.js';

export function projectEntity(entity, style, transform, blockContext, ctx) {
  const { addPrimitive, stats, document, arcSegments, splineSegments, maxBlockDepth } = ctx;
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
              projectEntity(childEntity, childStyle, composedTransform, bCtx, ctx);
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
