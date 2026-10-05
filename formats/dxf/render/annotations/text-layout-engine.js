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

import { affinePoint, ocsAffine, boundsOfPoints } from '../../../../geometry/cad/affine3d.js';
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
  1: { h: 'LEFT', v: 'TOP' },
  2: { h: 'CENTER', v: 'TOP' },
  3: { h: 'RIGHT', v: 'TOP' },
  4: { h: 'LEFT', v: 'MIDDLE' },
  5: { h: 'CENTER', v: 'MIDDLE' },
  6: { h: 'RIGHT', v: 'MIDDLE' },
  7: { h: 'LEFT', v: 'BOTTOM' },
  8: { h: 'CENTER', v: 'BOTTOM' },
  9: { h: 'RIGHT', v: 'BOTTOM' },
};

/**
 * Strip AutoCAD MTEXT formatting tags and return plain text.
 * @param {string} raw
 * @returns {string}
 */
export function cleanMTextFormatting(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw;

  // AutoCAD escape sequences
  text = text.replace(/%%d/gi, '°');
  text = text.replace(/%%p/gi, '±');
  text = text.replace(/%%c/gi, 'Ø');
  text = text.replace(/%%u/gi, '');
  text = text.replace(/%%o/gi, '');
  text = text.replace(/%%%/g, '%');

  // Paragraph breaks
  text = text.replace(/\\P/g, '\n');

  // Stacked fractions \S1/2; -> 1/2
  text = text.replace(/\\S([^;]+);/g, '$1');

  // Strip formatting tags
  text = text.replace(/\\[fF][^;]*;/g, '');
  text = text.replace(/\\[cChHwWqQaAtT][^;]*;/g, '');
  text = text.replace(/\\[oOlLkK]/g, '');

  // Strip brace groups
  let prev;
  do {
    prev = text;
    text = text.replace(/\{([^{}]*)\}/g, '$1');
  } while (text !== prev);

  text = text.replace(/\\\\/g, '\\');
  text = text.replace(/\\\{/g, '{');
  text = text.replace(/\\\}/g, '}');

  return text;
}

/**
 * Parse MTEXT string into structured formatted runs and report diagnostics.
 *
 * @param {string} rawText
 * @param {Object} [baseStyle]
 * @returns {{runs: Array<Object>, cleanText: string, diagnostics: Array<Object>}}
 */
export function parseMTextRuns(rawText, baseStyle = {}) {
  const diagnostics = [];
  if (!rawText || typeof rawText !== 'string') {
    return { runs: [], cleanText: '', diagnostics };
  }

  const baseFont = baseStyle.font || 'STANDARD';
  const baseHeight = Math.max(0.001, Number(baseStyle.height) || 2.5);
  const baseWidthFactor = Number.isFinite(Number(baseStyle.widthFactor)) ? Number(baseStyle.widthFactor) : 1.0;
  const baseOblique = Number(baseStyle.obliqueAngle) || 0;
  const baseColor = baseStyle.color || null;

  const stack = [{
    font: baseFont,
    height: baseHeight,
    widthFactor: baseWidthFactor,
    obliqueAngle: baseOblique,
    color: baseColor,
    underline: false,
    overline: false,
    strike: false,
  }];

  const runs = [];
  let currentRunText = '';

  function flushRun() {
    if (!currentRunText) return;
    const current = stack[stack.length - 1];
    runs.push({
      text: currentRunText,
      font: current.font,
      height: current.height,
      widthFactor: current.widthFactor,
      obliqueAngle: current.obliqueAngle,
      color: current.color,
      underline: current.underline,
      overline: current.overline,
      strike: current.strike,
      isStacked: false,
    });
    currentRunText = '';
  }

  let i = 0;
  const len = rawText.length;

  while (i < len) {
    const ch = rawText[i];

    // AutoCAD special escape %%%, %%d, %%p, %%c, %%u, %%o
    if (ch === '%' && rawText[i + 1] === '%') {
      const code = rawText[i + 2]?.toLowerCase();
      if (code === 'd') { currentRunText += '°'; i += 3; continue; }
      if (code === 'p') { currentRunText += '±'; i += 3; continue; }
      if (code === 'c') { currentRunText += 'Ø'; i += 3; continue; }
      if (code === '%') { currentRunText += '%'; i += 3; continue; }
      if (code === 'u') {
        flushRun();
        stack[stack.length - 1].underline = !stack[stack.length - 1].underline;
        i += 3;
        continue;
      }
      if (code === 'o') {
        flushRun();
        stack[stack.length - 1].overline = !stack[stack.length - 1].overline;
        i += 3;
        continue;
      }
    }

    // Scoped formatting block { ... }
    if (ch === '{') {
      flushRun();
      const current = stack[stack.length - 1];
      stack.push({ ...current });
      i++;
      continue;
    }

    if (ch === '}') {
      flushRun();
      if (stack.length > 1) {
        stack.pop();
      }
      i++;
      continue;
    }

    // Escape code
    if (ch === '\\') {
      const next = rawText[i + 1];

      // Paragraph break
      if (next === 'P') {
        flushRun();
        runs.push({ isLineBreak: true });
        i += 2;
        continue;
      }

      // Escaped characters: \\, \{, \}
      if (next === '\\' || next === '{' || next === '}') {
        currentRunText += next;
        i += 2;
        continue;
      }

      // Formatting codes: \F, \f, \C, \c, \H, \h, \W, \w, \Q, \q, \S, \s, \A, \a, \T, \t
      if (/[fFcChHwWqQsSaAtT]/.test(next)) {
        const semicolon = rawText.indexOf(';', i + 2);
        if (semicolon !== -1) {
          const tagContent = rawText.slice(i + 2, semicolon);
          flushRun();
          const current = stack[stack.length - 1];
          const tagChar = next.toUpperCase();

          switch (tagChar) {
            case 'F':
              current.font = tagContent;
              break;
            case 'C':
              current.color = tagContent;
              break;
            case 'H':
              if (tagContent.endsWith('x') || tagContent.endsWith('X')) {
                const factor = parseFloat(tagContent);
                if (Number.isFinite(factor) && factor > 0) current.height = baseHeight * factor;
              } else {
                const h = parseFloat(tagContent);
                if (Number.isFinite(h) && h > 0) current.height = h;
              }
              break;
            case 'W':
              const wf = parseFloat(tagContent);
              if (Number.isFinite(wf) && wf > 0) current.widthFactor = wf;
              break;
            case 'Q':
              const ob = parseFloat(tagContent);
              if (Number.isFinite(ob)) current.obliqueAngle = ob;
              break;
            case 'S':
              // Stacked fraction: upper^lower or upper/lower or upper#lower
              let sep = '^';
              if (tagContent.includes('/')) sep = '/';
              else if (tagContent.includes('#')) sep = '#';
              const parts = tagContent.split(sep);
              runs.push({
                isStacked: true,
                stackUpper: parts[0] || '',
                stackLower: parts[1] || '',
                stackType: sep,
                height: current.height,
                font: current.font,
              });
              break;
            case 'A':
            case 'T':
              diagnostics.push({
                code: 'MTEXT_UNSUPPORTED_FORMAT_CODE',
                tag: `\\${next}${tagContent};`,
                message: `Tag \\${next} is noted but not rendered in 2D baseline layout`,
              });
              break;
          }

          i = semicolon + 1;
          continue;
        }
      }

      // Single-character toggles: \L, \l (underline), \O, \o (overline), \K, \k (strike)
      if (/[oOlLkK]/.test(next)) {
        flushRun();
        const current = stack[stack.length - 1];
        if (next === 'L' || next === 'l') current.underline = (next === 'L');
        if (next === 'O' || next === 'o') current.overline = (next === 'O');
        if (next === 'K' || next === 'k') current.strike = (next === 'K');
        i += 2;
        continue;
      }
    }

    // Normal character
    currentRunText += ch;
    i++;
  }

  flushRun();

  const cleanText = runs
    .map(r => r.isLineBreak ? '\n' : r.isStacked ? `${r.stackUpper}/${r.stackLower}` : r.text || '')
    .join('');

  return { runs, cleanText, diagnostics };
}

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

  const p0 = geom.insertionPoint ? { ...geom.insertionPoint } : { x: geom.point?.x ?? 0, y: geom.point?.y ?? 0, z: geom.point?.z ?? 0 };
  const p1 = geom.alignmentPoint ? { ...geom.alignmentPoint } : null;

  const hCode = Number(attrs.horizJust ?? attrs.hAlign) || 0;
  const vCode = Number(attrs.vertJust ?? attrs.vAlign) || 0;
  const hAlign = H_ALIGN_CODES[hCode] || 'LEFT';
  const vAlign = V_ALIGN_CODES[vCode] || 'BASELINE';

  const rawText = String(attrs.rawText || attrs.text || '');
  const cleanText = cleanMTextFormatting(rawText);

  let height = Math.max(0.001, Number(attrs.height ?? geom.height) || 2.5);
  let widthFactor = Number.isFinite(Number(attrs.widthFactor ?? geom.widthFactor)) ? Number(attrs.widthFactor ?? geom.widthFactor) : 1.0;
  let rotationDeg = Number(attrs.rotation ?? geom.rotation ?? 0);
  const obliqueAngle = Number(attrs.obliqueAngle ?? geom.obliqueAngle) || 0;
  const generationFlags = Number(attrs.flags ?? attrs.generationFlags) || 0;
  const mirrorX = Boolean(generationFlags & 2);
  const mirrorY = Boolean(generationFlags & 4);

  let anchorPoint = { ...p0 };
  const diagnostics = [];

  // DXF Rule: ALIGNED (3) & FIT (5)
  if (hCode === 3 && p1) {
    // ALIGNED: scale height and width so text exactly spans p0 -> p1
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const targetLength = Math.hypot(dx, dy);
    rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const unitMeasure = provider.measureText(cleanText, { height: 1.0, widthFactor: 1.0, styleName: attrs.styleName });
    if (unitMeasure.width > 0 && targetLength > 0) {
      height = targetLength / unitMeasure.width;
      widthFactor = 1.0;
    }
    anchorPoint = { ...p0 };
  } else if (hCode === 5 && p1) {
    // FIT: preserve height, scale width factor so text spans p0 -> p1
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const targetLength = Math.hypot(dx, dy);
    rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const naturalMeasure = provider.measureText(cleanText, { height, widthFactor: 1.0, styleName: attrs.styleName });
    if (naturalMeasure.width > 0 && targetLength > 0) {
      widthFactor = targetLength / naturalMeasure.width;
    }
    anchorPoint = { ...p0 };
  } else if ((hCode > 0 || vCode > 0) && p1) {
    // Non-default alignment: alignmentPoint is authoritative anchor
    anchorPoint = { ...p1 };
  }

  const measured = provider.measureText(cleanText, { height, widthFactor, styleName: attrs.styleName });
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
    dy = -height;
  } else if (vAlign === 'MIDDLE') {
    dy = -height / 2;
  } else if (vAlign === 'BOTTOM') {
    dy = 0;
  } else {
    // BASELINE: baseline is at anchor y; descent hangs below 0
    dy = 0;
  }

  if (mirrorX) dx = -dx - totalWidth;
  if (mirrorY) dy = -dy - totalHeight;

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
    approximate: measured.hasMissingGlyphs || !provider.hasGlyph('A'),
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

  const anchorPoint = {
    x: geom.insertionPoint?.x ?? geom.point?.x ?? 0,
    y: geom.insertionPoint?.y ?? geom.point?.y ?? 0,
    z: geom.insertionPoint?.z ?? geom.point?.z ?? 0,
  };

  const rawText = String(attrs.rawText || attrs.text || '');
  const baseHeight = Math.max(0.001, Number(attrs.height ?? geom.height) || 2.5);
  const baseWidthFactor = Number.isFinite(Number(attrs.widthFactor ?? geom.widthFactor)) ? Number(attrs.widthFactor ?? geom.widthFactor) : 1.0;
  const refWidth = Math.max(0, Number(attrs.referenceWidth ?? attrs.width) || 0);

  const attachmentCode = Number(attrs.attachmentPoint ?? geom.attachmentPoint) || 1;
  const attachment = ATTACHMENT_MAP[attachmentCode] || { h: 'LEFT', v: 'TOP' };

  let rotationDeg = Number(attrs.rotation ?? geom.rotation ?? 0);
  if (geom.directionVector && (geom.directionVector.x !== 0 || geom.directionVector.y !== 0)) {
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
    });
    currentLineRuns = [];
    currentLineWidth = 0;
  }

  for (const run of runs) {
    if (run.isLineBreak) {
      pushLine();
      continue;
    }

    if (run.isStacked) {
      const stackedH = run.height * 0.7;
      const upperM = provider.measureText(run.stackUpper, { height: stackedH, widthFactor: baseWidthFactor });
      const lowerM = provider.measureText(run.stackLower, { height: stackedH, widthFactor: baseWidthFactor });
      const stackWidth = Math.max(upperM.width, lowerM.width);
      run.width = stackWidth;
      currentLineRuns.push(run);
      currentLineWidth += stackWidth;
      continue;
    }

    const runText = run.text || '';
    if (!refWidth || refWidth <= 0) {
      // No word wrapping
      const m = provider.measureText(runText, { height: run.height, widthFactor: run.widthFactor });
      run.width = m.width;
      currentLineRuns.push(run);
      currentLineWidth += m.width;
      continue;
    }

    // Word wrapping against reference width
    const words = runText.split(/(\s+)/);
    for (const w of words) {
      if (!w) continue;
      const wm = provider.measureText(w, { height: run.height, widthFactor: run.widthFactor });
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

  // Compute block metrics
  const lineSpacingFactor = Number(attrs.lineSpacingFactor) || 1.0;
  const lineHeight = baseHeight * lineSpacingFactor * 1.666;
  const maxLineWidth = lines.reduce((m, l) => Math.max(m, l.width), 0);
  const totalWidth = refWidth > 0 ? Math.max(refWidth, maxLineWidth) : maxLineWidth;
  const totalHeight = Math.max(baseHeight, (lines.length - 1) * lineHeight + baseHeight);

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
