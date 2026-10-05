/**
 * formats/dxf/render/annotations/text-layout-engine.js
 *
 * Source-space layout engine for CAD TEXT and MTEXT entities.
 * Handles insertion/alignment geometry, justifications, MTEXT formatting runs,
 * line-breaking, reference-width wrapping, attachment points, oblique/mirror flags,
 * and conservative oriented bounding boxes.
 *
 * Guaranteed zero mutation to input entity or source text bytes.
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

import { boundsOfPoints } from '../../../../geometry/cad/affine3d.js';
import { createDefaultGlyphProvider } from './glyph-provider.js';

/**
 * Text horizontal and vertical justification codes for standard TEXT entities.
 */
const H_ALIGN_CODES = ['LEFT', 'CENTER', 'RIGHT', 'ALIGNED', 'MIDDLE', 'FIT'];
const V_ALIGN_CODES = ['BASELINE', 'BOTTOM', 'MIDDLE', 'TOP'];

/**
 * MTEXT Attachment mapping (group 71).
 */
const ATTACHMENT_MAP = {
  1: { h: 'LEFT', v: 'TOP' }, 2: { h: 'CENTER', v: 'TOP' }, 3: { h: 'RIGHT', v: 'TOP' },
  4: { h: 'LEFT', v: 'MIDDLE' }, 5: { h: 'CENTER', v: 'MIDDLE' }, 6: { h: 'RIGHT', v: 'MIDDLE' },
  7: { h: 'LEFT', v: 'BOTTOM' }, 8: { h: 'CENTER', v: 'BOTTOM' }, 9: { h: 'RIGHT', v: 'BOTTOM' },
};

export { cleanMTextFormatting, parseMTextRuns } from './mtext-format.js';
import { parseMTextRuns } from './mtext-format.js';
import { positiveNumber, finiteNumber, nativeValue, textPoint, plainText } from './text-values.js';

/**
 * Perform source-space layout for a standard TEXT entity.
 *
 * @param {Object} entity - DxfEntity (read-only)
 * @param {import('./glyph-provider.js').GlyphProvider} [glyphProvider]
 * @param {Object} [options]
 * @returns {Object} Layout result
 */
export function layoutTextEntity(entity, glyphProvider, options = {}) {
  const provider = glyphProvider || createDefaultGlyphProvider();
  const geom = entity.geometry || {};
  const attrs = entity.attributes || {};

  const p0 = textPoint(geom.insertionPoint || geom.point);
  const p1 = geom.alignmentPoint ? textPoint(geom.alignmentPoint) : null;

  const hCode = Number(attrs.horizJust ?? attrs.hAlign) || 0;
  const vCode = Number(attrs.vertJust ?? attrs.vAlign) || 0;
  const hAlign = H_ALIGN_CODES[hCode] || 'LEFT';
  const vAlign = V_ALIGN_CODES[vCode] || 'BASELINE';

  const rawText = String(attrs.rawText ?? attrs.text ?? '');
  const cleanText = plainText(rawText);

  const rawH = Number(attrs.height ?? geom.height);
  let height = Number.isFinite(rawH) && rawH > 0 ? rawH : 2.5;
  let widthFactor = positiveNumber(attrs.widthFactor ?? geom.widthFactor, 1);
  let rotationDeg = finiteNumber(attrs.rotation ?? geom.rotation);
  const obliqueAngle = finiteNumber(attrs.obliqueAngle ?? geom.obliqueAngle);
  const generationFlags = finiteNumber(attrs.textGenFlags ?? attrs.flags ?? attrs.generationFlags);
  const mirrorX = Boolean(generationFlags & 2);
  const mirrorY = Boolean(generationFlags & 4);

  let anchorPoint = { ...p0 };
  const diagnostics = [];

  // DXF Rule: ALIGNED (3) & FIT (5)
  if (hCode === 3 && vCode === 0 && p1) {
    // ALIGNED: scale height and width so text exactly spans p0 -> p1
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const targetLength = Math.hypot(dx, dy);
    rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const unitMeasure = provider.measureText(cleanText, { height: 1.0, widthFactor: 1.0, styleName: attrs.styleName, fontFile: options.fontFile ?? attrs.fontFile });
    if (unitMeasure.width > 0 && targetLength > 0) {
      height = targetLength / unitMeasure.width;
      widthFactor = 1.0;
    }
    anchorPoint = { ...p0 };
  } else if (hCode === 5 && vCode === 0 && p1) {
    // FIT: preserve height, scale width factor so text spans p0 -> p1
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const targetLength = Math.hypot(dx, dy);
    rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const naturalMeasure = provider.measureText(cleanText, { height, widthFactor: 1.0, styleName: attrs.styleName, fontFile: options.fontFile ?? attrs.fontFile });
    if (naturalMeasure.width > 0 && targetLength > 0) {
      widthFactor = targetLength / naturalMeasure.width;
    }
    anchorPoint = { ...p0 };
  } else if ((hCode > 0 || vCode > 0) && p1) {
    // Non-default alignment: alignmentPoint is authoritative anchor
    anchorPoint = { ...p1 };
  }

  const measured = provider.measureText(cleanText, { height, widthFactor, styleName: attrs.styleName, fontFile: options.fontFile ?? attrs.fontFile });
  const totalWidth = measured.width;
  const totalHeight = height;
  const descent = measured.descent;
  const ascent = measured.ascent;

  // Horizontal offset
  let dx = 0;
  if (hAlign === 'CENTER' || hAlign === 'MIDDLE') {
    dx = -totalWidth / 2;
  } else if (hAlign === 'RIGHT') {
    dx = -totalWidth;
  }

  // Vertical offset
  let dy = 0;
  if (vAlign === 'TOP') {
    dy = -ascent;
  } else if (vAlign === 'MIDDLE') {
    dy = (descent - ascent) / 2;
  } else if (vAlign === 'BOTTOM') {
    dy = descent;
  } else {
    // BASELINE: baseline is at anchor y; descent hangs below 0
    dy = 0;
  }

  if (hAlign === 'MIDDLE' && vCode === 0) dy = (descent - ascent) / 2;

  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  // Local unrotated oriented box: [minX, minY] to [maxX, maxY]
  const localCorners = [
    { x: dx, y: dy - descent },
    { x: dx + totalWidth, y: dy - descent },
    { x: dx + totalWidth, y: dy + ascent },
    { x: dx, y: dy + ascent },
  ];

  const shear = Math.tan(obliqueAngle * Math.PI / 180);
  if (!Number.isFinite(shear)) throw new Error('Invalid annotation oblique angle');
  for (const corner of localCorners) {
    corner.x = (corner.x + shear * corner.y) * (mirrorX ? -1 : 1);
    corner.y *= mirrorY ? -1 : 1;
  }

  // Rotate local corners in text plane and translate by anchor
  const planeCorners = localCorners.map(c => ({
    x: c.x * cos - c.y * sin + anchorPoint.x,
    y: c.x * sin + c.y * cos + anchorPoint.y,
    z: anchorPoint.z || 0,
  }));

  const localBounds = boundsOfPoints(planeCorners);

  return {
    type: 'TEXT',
    rawText,
    cleanText,
    anchorPoint,
    insertionPoint: p0,
    alignmentPoint: p1,
    hAlign,
    vAlign,
    height,
    widthFactor,
    obliqueAngle,
    rotationDeg,
    rotationRad,
    mirrorX,
    mirrorY,
    metrics: {
      width: totalWidth,
      height: totalHeight,
      ascent,
      descent,
    },
    localCorners,
    planeCorners,
    localBounds,
    diagnostics,
    approximate: Boolean(measured.approximate || measured.hasMissingGlyphs || !provider.hasGlyph('A')),
  };
}

/**
 * Perform source-space layout for an MTEXT entity.
 *
 * @param {Object} entity - DxfEntity (read-only)
 * @param {import('./glyph-provider.js').GlyphProvider} [glyphProvider]
 * @param {Object} [options]
 * @returns {Object} Layout result
 */
export function layoutMTextEntity(entity, glyphProvider, options = {}) {
  const provider = glyphProvider || createDefaultGlyphProvider();
  const geom = entity.geometry || {};
  const attrs = entity.attributes || {};

  const anchorPoint = textPoint(geom.insertionPoint || geom.point);

  const rawText = String(attrs.rawText ?? attrs.text ?? '');
  const rawH = Number(attrs.height ?? geom.height);
  const baseHeight = Number.isFinite(rawH) && rawH > 0 ? rawH : 2.5;
  const baseWidthFactor = positiveNumber(attrs.widthFactor ?? geom.widthFactor, 1);
  const refWidth = Math.max(0, finiteNumber(attrs.rectWidth ?? attrs.referenceWidth ?? attrs.width));

  const attachmentCode = Number(attrs.attachmentPoint ?? geom.attachmentPoint) || 1;
  const attachment = ATTACHMENT_MAP[attachmentCode] || { h: 'LEFT', v: 'TOP' };

  const nativeAngle = nativeValue(entity, 50, null);
  let rotationDeg = nativeAngle !== null ? finiteNumber(nativeAngle) * 180 / Math.PI : finiteNumber(attrs.rotation ?? geom.rotation);
  if (nativeAngle === null && geom.directionVector && (geom.directionVector.x !== 0 || geom.directionVector.y !== 0)) {
    rotationDeg = (Math.atan2(geom.directionVector.y, geom.directionVector.x) * 180) / Math.PI;
  }
  const rotationRad = (rotationDeg * Math.PI) / 180;

  const { runs, cleanText, diagnostics } = parseMTextRuns(rawText, {
    height: baseHeight,
    widthFactor: baseWidthFactor,
    font: attrs.styleName || 'STANDARD',
  });

  // Line-break and word-wrap algorithm
  const lines = [];
  let currentLineRuns = [];
  let currentLineWidth = 0;

  function pushLine() {
    lines.push({
      runs: currentLineRuns,
      width: currentLineWidth,
      height: currentLineRuns.reduce((h,r)=>Math.max(h,r.height || baseHeight),baseHeight),
    });
    currentLineRuns = [];
    currentLineWidth = 0;
  }

  const runFont = run => provider.resolveFont?.(run.font?.split('|')[0], options.fontFile) || {name:run.font};
  for (const run of runs) {
    if (run.isLineBreak) {
      pushLine();
      continue;
    }

    if (run.isStacked) {
      const stackedH = run.height * 0.7;
      const upperM = provider.measureText(run.stackUpper, { height: stackedH, widthFactor: baseWidthFactor, font: runFont(run), styleName: run.font });
      const lowerM = provider.measureText(run.stackLower, { height: stackedH, widthFactor: baseWidthFactor, font: runFont(run), styleName: run.font });
      const stackWidth = Math.max(upperM.width, lowerM.width);
      run.width = stackWidth;
      currentLineRuns.push(run);
      currentLineWidth += stackWidth;
      continue;
    }

    const runText = run.text || '';
    if (!refWidth || refWidth <= 0) {
      // No word wrapping
      const m = provider.measureText(runText, { height: run.height, widthFactor: run.widthFactor, font: runFont(run), styleName: run.font });
      run.width = m.width;
      currentLineRuns.push(run);
      currentLineWidth += m.width;
      continue;
    }

    // Word wrapping against reference width
    const words = runText.split(/(\s+)/);
    for (const w of words) {
      if (!w) continue;
      const wm = provider.measureText(w, { height: run.height, widthFactor: run.widthFactor, font: runFont(run), styleName: run.font });
      if (currentLineWidth + wm.width > refWidth && currentLineWidth > 0 && !/^\s+$/.test(w)) {
        pushLine();
      }
      currentLineRuns.push({
        ...run,
        text: w,
        width: wm.width,
      });
      currentLineWidth += wm.width;
    }
  }

  pushLine();
  for (const run of runs) if (run.obliqueAngle) diagnostics.push({code:'MTEXT_APPROXIMATE_OBLIQUE',message:'Run shear requires glyph rendering; bounds conservatively include shear'});

  // Compute block metrics
  const lineSpacingFactor = positiveNumber(attrs.lineSpacingFactor, 1);
  const lineHeight = baseHeight * lineSpacingFactor * 1.666;
  const maxLineWidth = lines.reduce((m, l) => Math.max(m, l.width), 0);
  const shearPad = runs.reduce((m,r)=>Math.max(m,Math.abs(Math.tan((r.obliqueAngle || 0)*Math.PI/180))*(r.height || baseHeight)),0);
  const totalWidth = (refWidth > 0 ? Math.max(refWidth, maxLineWidth) : maxLineWidth) + 2*shearPad;
  const totalHeight = lines.reduce((sum,line,i)=>sum+line.height+(i ? Math.max(0,lineHeight-baseHeight) : 0),0);

  // Horizontal offset
  let dx = 0;
  if (attachment.h === 'CENTER') {
    dx = -totalWidth / 2;
  } else if (attachment.h === 'RIGHT') {
    dx = -totalWidth;
  }

  // Vertical offset
  let dy = 0;
  if (attachment.v === 'TOP') {
    dy = -baseHeight;
  } else if (attachment.v === 'MIDDLE') {
    dy = totalHeight / 2 - baseHeight;
  } else if (attachment.v === 'BOTTOM') {
    dy = totalHeight - baseHeight;
  }

  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  const localCorners = [
    { x: dx, y: dy - totalHeight + baseHeight },
    { x: dx + totalWidth, y: dy - totalHeight + baseHeight },
    { x: dx + totalWidth, y: dy + baseHeight },
    { x: dx, y: dy + baseHeight },
  ];

  const planeCorners = localCorners.map(c => ({
    x: c.x * cos - c.y * sin + anchorPoint.x,
    y: c.x * sin + c.y * cos + anchorPoint.y,
    z: anchorPoint.z || 0,
  }));

  const localBounds = boundsOfPoints(planeCorners);

  return {
    type: 'MTEXT',
    rawText,
    cleanText,
    anchorPoint,
    attachmentPoint: attachmentCode,
    attachment,
    height: baseHeight,
    referenceWidth: refWidth,
    rotationDeg,
    rotationRad,
    lines,
    lineHeight,
    metrics: {
      width: totalWidth,
      height: totalHeight,
      maxLineWidth,
      lineCount: lines.length,
    },
    localCorners,
    planeCorners,
    localBounds,
    diagnostics,
    approximate: true,
  };
}
