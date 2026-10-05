/**
 * formats/dxf/render/annotations/annotation-projector.js
 *
 * Projects DXF TEXT and MTEXT entities into source-native annotation render primitives.
 * Bridges text layout with 3D OCS/world affine transformations, block occurrence
 * identities, conservative bounding boxes, and glyph coverage diagnostics.
 *
 * Guarantees zero mutation to input entity geometry or attributes.
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

import { affinePoint, affineVector, ocsAffine, boundsOfPoints } from '../../../../geometry/cad/affine3d.js';
import { occurrenceIdentity } from '../dxf-occurrence.js';
import { layoutTextEntity, layoutMTextEntity } from './text-layout-engine.js';
import { annotationNormal, mtextFrame } from './annotation-frame.js';
import { createDefaultGlyphProvider } from './glyph-provider.js';

/**
 * Transform a point through block occurrence transform.
 * @param {{x, y, z}} p
 * @param {Object} [transform]
 * @param {{x, y, z}} [basePoint]
 * @returns {{x: number, y: number, z: number}}
 */
function transformWorldPoint(p, transform, basePoint) {
  if (!transform) return { ...p };
  return affinePoint(p, transform.matrix, basePoint);
}

/**
 * Project a TEXT or MTEXT entity into a source-native AnnotationPrimitive.
 *
 * @param {Object} entity - DxfEntity (read-only)
 * @param {Object} resolvedStyle - Style info from dxf-style-resolver
 * @param {Object} [options]
 * @param {Object} [options.transform] - Block transform
 * @param {Object} [options.blockContext] - Block occurrence context
 * @param {import('./glyph-provider.js').GlyphProvider} [options.glyphProvider] - Glyph provider
 * @returns {Object} AnnotationPrimitive
 */
export function projectAnnotation(entity, resolvedStyle, options = {}) {
  if (!entity || !entity.id) {
    throw new Error('projectAnnotation requires a valid entity with document-scoped id');
  }

  if (!['TEXT','MTEXT'].includes(entity.type)) throw new Error('Annotation projection supports TEXT/MTEXT only');
  const { transform, blockContext, glyphProvider } = options;
  const provider = glyphProvider || createDefaultGlyphProvider();

  // Snapshot input values to verify immutability
  const originalRawText = entity.attributes?.rawText ?? entity.attributes?.text;
  const originalHeight = entity.attributes?.height ?? entity.geometry?.height;

  const identity = occurrenceIdentity(entity, blockContext);
  const basePoint = blockContext?.basePoint;

  // Extrusion / OCS transformation
  const plane = ocsAffine(annotationNormal(entity));

  // Layout text in source text plane
  const isMText = entity.type === 'MTEXT';
  const layoutOptions = {...options,fontFile: options.fontFile ?? resolvedStyle?.fontFile};
  const layout = isMText
    ? layoutMTextEntity(entity, provider, layoutOptions)
    : layoutTextEntity(entity, provider, layoutOptions);

  // Map text plane point to 3D world space
  const toWorld = p => {
    // Standard TEXT uses OCS extrusion; MTEXT standard specifies OCS or world
    const local = isMText ? { ...p } : affinePoint(p, plane);
    return transform ? affinePoint(local, transform.matrix, basePoint) : local;
  };

  const toWorldVector = v => {
    const local = isMText ? { ...v } : affineVector(v, plane);
    return transform ? affineVector(local, transform.matrix) : local;
  };

  const frame = isMText ? mtextFrame(entity,layout.rotationRad) : null;
  const worldPosition = toWorld(layout.anchorPoint);
  const worldAlignmentPoint = layout.alignmentPoint ? toWorld(layout.alignmentPoint) : null;

  // Calculate oriented axes
  const rad = layout.rotationRad || 0;
  const localX = frame?.x || { x: Math.cos(rad)*(layout.mirrorX?-1:1), y: Math.sin(rad)*(layout.mirrorX?-1:1), z: 0 };
  const shear=Math.tan((layout.obliqueAngle || 0)*Math.PI/180);
  const sx=layout.mirrorX?-1:1,sy=layout.mirrorY?-1:1;
  const localY = frame?.y || { x: shear*sx*Math.cos(rad)-sy*Math.sin(rad), y: shear*sx*Math.sin(rad)+sy*Math.cos(rad), z: 0 };
  const worldXAxis = toWorldVector(localX);
  const worldYAxis = toWorldVector(localY);

  // Transform all 2D plane bounding corners into 3D world space
  const worldCorners = isMText ? layout.localCorners.map(c=>toWorld({
    x:layout.anchorPoint.x+c.x*frame.x.x+c.y*frame.y.x,
    y:layout.anchorPoint.y+c.x*frame.x.y+c.y*frame.y.y,
    z:layout.anchorPoint.z+c.x*frame.x.z+c.y*frame.y.z,
  })) : layout.planeCorners.map(toWorld);
  const worldBounds = boundsOfPoints(worldCorners);

  // Glyph coverage report
  const coverage = provider.getCoverageReport();

  // Verify immutability invariant
  const currentRawText = entity.attributes?.rawText ?? entity.attributes?.text;
  const currentHeight = entity.attributes?.height ?? entity.geometry?.height;
  if (currentRawText !== originalRawText || currentHeight !== originalHeight) {
    throw new Error('FATAL: Layout engine mutated authoritative source entity properties');
  }

  return {
    type: 'annotation',
    annotationType: entity.type,
    ...identity,
    layer: resolvedStyle?.layerName || '0',
    style: resolvedStyle || {},
    text: layout.cleanText,
    rawText: layout.rawText,
    position: worldPosition,
    alignmentPoint: worldAlignmentPoint,
    xAxis: worldXAxis,
    yAxis: worldYAxis,
    rotationDeg: layout.rotationDeg,
    rotationRad: layout.rotationRad,
    height: layout.height,
    widthFactor: layout.widthFactor || 1.0,
    obliqueAngle: layout.obliqueAngle || 0,
    hAlign: layout.hAlign || 'LEFT',
    vAlign: layout.vAlign || 'BASELINE',
    attachmentPoint: layout.attachmentPoint || null,
    lines: layout.lines || [{ text: layout.cleanText, width: layout.metrics.width }],
    metrics: layout.metrics,
    bounds: {
      ...worldBounds,
      corners: worldCorners,
      approximate: Boolean(layout.approximate),
      reason: layout.approximate ? 'Synthetic font metrics or partial formatting; external visual acceptance pending' : undefined,
    },
    coverage: {
      totalMeasured: coverage.totalMeasured,
      totalFallback: coverage.totalFallback,
      coverageRatio: coverage.coverageRatio,
      missingGlyphs: coverage.missingGlyphs,
      approximate: Boolean(coverage.approximate),
      fontResourceVerified: coverage.fontResourceVerified === true,
    },
    diagnostics: layout.diagnostics || [],
    approximate: Boolean(layout.approximate),
    blockContext: blockContext || null,
  };
}
