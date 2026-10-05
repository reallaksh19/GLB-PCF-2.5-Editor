import { positiveNumber, finiteNumber } from "./text-values.js";

/**
 * Strip AutoCAD MTEXT formatting tags and return plain text.
 * @param {string} raw
 * @returns {string}
 */
export function cleanMTextFormatting(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw;

  // Protect escaped characters first with placeholders so \\P, \{, \} are not consumed as formatting
  text = text.replace(/\\\\/g, '\u0001');
  text = text.replace(/\\\{/g, '\u0002');
  text = text.replace(/\\\}/g, '\u0003');

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

  // Restore escaped characters
  text = text.replace(/\u0001/g, '\\');
  text = text.replace(/\u0002/g, '{');
  text = text.replace(/\u0003/g, '}');

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
  const baseHeight = positiveNumber(baseStyle.height,2.5);
  const baseWidthFactor = positiveNumber(baseStyle.widthFactor,1);
  const baseOblique = finiteNumber(baseStyle.obliqueAngle);
  const baseColor = baseStyle.color || null;

  const stack = [{
    font: baseFont, height: baseHeight, widthFactor: baseWidthFactor,
    obliqueAngle: baseOblique, color: baseColor, underline: false, overline: false, strike: false,
  }];

  const runs = [];
  let currentRunText = '';

  function flushRun() {
    if (!currentRunText) return;
    const current = stack[stack.length - 1];
    runs.push({
      text: currentRunText, font: current.font, height: current.height,
      widthFactor: current.widthFactor, obliqueAngle: current.obliqueAngle,
      color: current.color, underline: current.underline, overline: current.overline,
      strike: current.strike, isStacked: false,
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
                if (Number.isFinite(factor) && factor > 0 && Number.isFinite(baseHeight*factor)) current.height = baseHeight * factor;
                else diagnostics.push({code:'MTEXT_INVALID_HEIGHT',tag:tagContent});
              } else {
                const h = parseFloat(tagContent);
                if (Number.isFinite(h) && h > 0) current.height = h;
                else diagnostics.push({code:'MTEXT_INVALID_HEIGHT',tag:tagContent});
              }
              break;
            case 'W':
              const wf = parseFloat(tagContent);
              if (Number.isFinite(wf) && wf > 0) current.widthFactor = wf;
              else diagnostics.push({code:'MTEXT_INVALID_WIDTH',tag:tagContent});
              break;
            case 'Q':
              const ob = parseFloat(tagContent);
              if (Number.isFinite(ob) && Math.abs(ob)<89) current.obliqueAngle = ob;
              else diagnostics.push({code:'MTEXT_INVALID_OBLIQUE',tag:tagContent});
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
                widthFactor: current.widthFactor, color: current.color,
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

    if (ch === '\\') diagnostics.push({code:'MTEXT_UNSUPPORTED_FORMAT_CODE',tag:rawText.slice(i,i+2),message:'Unknown or malformed format is preserved as literal text'});

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

