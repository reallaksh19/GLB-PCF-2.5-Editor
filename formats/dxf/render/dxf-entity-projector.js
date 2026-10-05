import { affinePoint, affineVector, ocsAffine } from '../../../geometry/cad/affine3d.js';
import { occurrenceIdentity } from './dxf-occurrence.js';
import { projectBlockInstance, transformPoint } from './dxf-block-renderer.js';
import { projectTextPrimitive } from './dxf-text-renderer.js';
import { sampleBulgeArc, sampleArc, sampleCircle, sampleEllipse, sampleSpline } from './dxf-geometry-sampler.js';

export function projectEntity(entity, style, transform, blockContext, ctx) {
  const { addPrimitive, stats, document, arcSegments, splineSegments, maxBlockDepth } = ctx;
  const identity = occurrenceIdentity(entity, blockContext);
  const basePoint = blockContext?.basePoint;
  const world = p => transform ? transformPoint(p, transform, basePoint) : { ...p };
  const plane = ocsAffine(entity.geometry?.extrusion);
  const ocsWorld = p => world(affinePoint(p, plane));
  const worldVector = p => transform ? affineVector(p, transform.matrix) : { ...p };

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
            ...identity,
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

        case 'ARC':
        case 'CIRCLE': {
          const g=entity.geometry, rawCenter=g.center || {x:0,y:0,z:0};
          const radius=g.radius ?? 0, startAngle=g.startAngle ?? 0, endAngle=g.endAngle ?? 360;
          const sourcePoints=entity.type==='CIRCLE' ? sampleCircle(rawCenter,radius,arcSegments) : sampleArc(rawCenter,radius,startAngle,endAngle,arcSegments);
          const points=sourcePoints.map(ocsWorld), center=ocsWorld(rawCenter);
          const axisX=worldVector(affineVector({x:radius,y:0,z:0},plane)), axisY=worldVector(affineVector({x:0,y:radius,z:0},plane));
          const a=Math.hypot(axisX.x,axisX.y,axisX.z), b=Math.hypot(axisY.x,axisY.y,axisY.z);
          const circular=Math.abs(a-b)<1e-10*Math.max(a,b,1) && Math.abs(axisX.x*axisY.x+axisX.y*axisY.y+axisX.z*axisY.z)<1e-10*Math.max(a*b,1);
          stats[entity.type==='CIRCLE'?'circles':'arcs']++;
          addPrimitive({type:circular?entity.type.toLowerCase():'ellipse',...identity,layer:style.layerName,style,center,
            radius:circular?a:undefined,sourceType:entity.type,axisX,axisY,startAngle,endAngle,
            startPoint:points[0],endPoint:points.at(-1),points,blockContext:blockContext || null});
          break;
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const rawVertices = Array.isArray(entity.geometry?.vertices) ? entity.geometry.vertices : [];
          if (rawVertices.length < 2) break;

          const is3D=Boolean(entity.geometry?.is3D || entity.attributes?.flags & 8);
          const sourceVertices=rawVertices.map(v=>({...v,z:is3D?(v.z??0):(entity.geometry.elevation??v.z??0)}));
          const mapPoint=is3D?world:ocsWorld;
          const transformedVertices=sourceVertices.map(v=>({...mapPoint(v),bulge:Number(v.bulge)||0,startWidth:v.startWidth,endWidth:v.endWidth}));
          const closed=Boolean(entity.geometry?.closed),count=closed?sourceVertices.length:sourceVertices.length-1;
          const allPoints=[],segments=[];
          for(let i=0;i<count;i++) {
            const v1=sourceVertices[i],v2=sourceVertices[(i+1)%sourceVertices.length],bulge=Number(v1.bulge)||0;
            const points=(bulge?sampleBulgeArc(v1,v2,bulge,arcSegments):[v1,v2]).map(mapPoint);
            segments.push({type:bulge?'arc':'line',bulge,points});
            allPoints.push(...(allPoints.length?points.slice(1):points));
          }

          stats.polylines++;
          addPrimitive({
            type: 'polyline',
            ...identity,
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
          const g=entity.geometry,controlPoints=(g.controlPoints || []).map(world),fitPoints=(g.fitPoints || []).map(world);
          let points,approximate=false;
          try { points=sampleSpline(g,false,splineSegments).map(world); }
          catch(error) {
            points=(g.fitPoints?.length>=2?g.fitPoints:g.controlPoints || []).map(world);
            approximate=true;
            ctx.diagnostics?.push({entityId:identity.sourceEntityId,code:'SPLINE_BASIS_UNSUPPORTED',message:error.message});
          }
          stats.splines++;
          addPrimitive({type:'spline',...identity,layer:style.layerName,style,controlPoints,fitPoints,
            degree:g.degree,closed:Boolean(entity.attributes?.flags & 1),points,approximate,blockContext:blockContext || null});
          break;
        }
        case 'ELLIPSE': {
          const g=entity.geometry,rawCenter=g.center || {x:0,y:0,z:0},rawMajor=g.majorAxis || {x:1,y:0,z:0};
          const points=sampleEllipse(rawCenter,rawMajor,g.ratio,g.startParam??0,g.endParam??2*Math.PI,arcSegments,g.extrusion).map(world);
          stats.ellipses++;
          addPrimitive({type:'ellipse',...identity,layer:style.layerName,style,center:world(rawCenter),
            majorAxis:worldVector(rawMajor),sourceRatio:g.ratio,startParam:g.startParam??0,endParam:g.endParam??2*Math.PI,points,blockContext:blockContext || null});
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
            ...identity,
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
            ...identity,
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
                  rootInsertId: blockContext?.rootInsertId || entity.id,
                  insertHandle: entity.handle || 'DIMENSION',
                }, ctx);
              }
            );
          } else {
            // Synthesize dimension lines from definition points (p10, p11, p13, p14)
            const dp = entity.geometry?.defPoints || {};
            const p10 = dp.p10 ? (transform ? transformPoint(dp.p10, transform, basePoint) : { ...dp.p10 }) : null;
            const p11 = dp.p11 ? (transform ? transformPoint(dp.p11, transform, basePoint) : { ...dp.p11 }) : null;
            const p13 = dp.p13 ? (transform ? transformPoint(dp.p13, transform, basePoint) : { ...dp.p13 }) : null;
            const p14 = dp.p14 ? (transform ? transformPoint(dp.p14, transform, basePoint) : { ...dp.p14 }) : null;

            const dimPoints = [p13, p14, p10, p11].filter(Boolean);

            addPrimitive({
              type: 'dimension',
              ...identity,
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
            ...identity,
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

          if (!boundaryPoints.length) { ctx.diagnostics?.push({entityId:entity.id,code:'HATCH_BOUNDARY_UNSUPPORTED'}); break; }
          addPrimitive({
            type: 'hatch',
            ...identity,
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
            const position = transform ? transformPoint(entity.geometry.point, transform, basePoint) : { ...entity.geometry.point };
            addPrimitive({
              type: 'unknown',
              originalType: entity.type,
              ...identity,
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
