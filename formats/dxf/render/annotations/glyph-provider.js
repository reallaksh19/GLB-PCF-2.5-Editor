import { positiveNumber } from "./text-values.js";

/**
 * formats/dxf/render/annotations/glyph-provider.js
 *
 * Glyph metrics provider contract and standard CAD font metric tables.
 * Provides font resolution, per-character advance/bounds measurement,
 * explicit fallback tracking, coverage reporting, and cache lifecycle disposal.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

/**
 * Base abstract contract for glyph providers.
 */
export class GlyphProvider {
  /**
   * Resolve font family / style descriptor.
   * @param {string} styleName
   * @param {string} [fontFile]
   * @returns {Object} Font descriptor
   */
  resolveFont(styleName, fontFile) {
    throw new Error('GlyphProvider.resolveFont must be implemented by subclass');
  }

  /**
   * Get metrics for a single character under given font options.
   * @param {string} char
   * @param {Object} options
   * @returns {{width: number, ascent: number, descent: number, advance: number, fallback: boolean}}
   */
  getCharMetrics(char, options) {
    throw new Error('GlyphProvider.getCharMetrics must be implemented by subclass');
  }

  /**
   * Measure a full text string or formatted run.
   * @param {string} text
   * @param {Object} options - { height, widthFactor, font, styleName }
   * @returns {Object} Measured string layout info
   */
  measureText(text, options) {
    throw new Error('GlyphProvider.measureText must be implemented by subclass');
  }

  /**
   * Check if a glyph is explicitly supported in the active font.
   * @param {string} char
   * @param {string} [fontName]
   * @returns {boolean}
   */
  hasGlyph(char, fontName) {
    throw new Error('GlyphProvider.hasGlyph must be implemented by subclass');
  }

  /**
   * Return coverage and fallback statistics.
   * @returns {Object}
   */
  getCoverageReport() {
    throw new Error('GlyphProvider.getCoverageReport must be implemented by subclass');
  }

  /**
   * Dispose cached metrics and subscriptions.
   */
  dispose() {
    // Default no-op
  }
}

/**
 * Standard ASCII and CAD symbol proportional relative width table (normalized to height = 1.0).
 * Heuristic estimates only; no font outlines or CAD reference measurements are loaded.
 */
const PROPORTIONAL_WIDTH_RATIOS = {
  ' ': 0.35, '!': 0.25, '"': 0.40, '#': 0.70, '$': 0.65, '%': 0.85, '&': 0.75, '\'': 0.20,
  '(': 0.35, ')': 0.35, '*': 0.50, '+': 0.65, ',': 0.25, '-': 0.45, '.': 0.25, '/': 0.55,
  '0': 0.65, '1': 0.45, '2': 0.65, '3': 0.65, '4': 0.65, '5': 0.65, '6': 0.65, '7': 0.60,
  '8': 0.65, '9': 0.65, ':': 0.25, ';': 0.25, '<': 0.65, '=': 0.65, '>': 0.65, '?': 0.60,
  '@': 0.85, 'A': 0.70, 'B': 0.65, 'C': 0.70, 'D': 0.70, 'E': 0.60, 'F': 0.55, 'G': 0.75,
  'H': 0.70, 'I': 0.25, 'J': 0.50, 'K': 0.65, 'L': 0.55, 'M': 0.85, 'N': 0.70, 'O': 0.75,
  'P': 0.60, 'Q': 0.75, 'R': 0.65, 'S': 0.60, 'T': 0.60, 'U': 0.70, 'V': 0.70, 'W': 0.90,
  'X': 0.65, 'Y': 0.65, 'Z': 0.60, '[': 0.35, '\\': 0.55, ']': 0.35, '^': 0.65, '_': 0.60,
  '`': 0.30, 'a': 0.55, 'b': 0.60, 'c': 0.50, 'd': 0.60, 'e': 0.55, 'f': 0.35, 'g': 0.60,
  'h': 0.60, 'i': 0.25, 'j': 0.25, 'k': 0.55, 'l': 0.25, 'm': 0.85, 'n': 0.60, 'o': 0.60,
  'p': 0.60, 'q': 0.60, 'r': 0.40, 's': 0.50, 't': 0.35, 'u': 0.60, 'v': 0.55, 'w': 0.75,
  'x': 0.55, 'y': 0.55, 'z': 0.50, '{': 0.35, '|': 0.20, '}': 0.35, '~': 0.65,
  // Standard CAD engineering symbols
  '°': 0.45, '±': 0.65, 'Ø': 0.75, '²': 0.45, '³': 0.45, 'µ': 0.65, 'Ω': 0.75,
};

/**
 * Standard monospace relative width ratio.
 */
const MONOSPACE_WIDTH_RATIO = 0.60;

/**
 * Default fallback ratio for unmeasured or unlisted characters.
 */
const DEFAULT_FALLBACK_RATIO = 0.65;

/**
 * Production implementation of GlyphProvider using synthetic CAD width estimates.
 */
export class StandardGlyphProvider extends GlyphProvider {
  constructor(options = {}) {
    super();
    this._fontRegistry = new Map(options.fontRegistry || []);
    this._maxCacheSize = Number.isSafeInteger(options.maxCacheSize) && options.maxCacheSize >= 0 ? options.maxCacheSize : 10000;
    this._measureCache = new Map();
    this._measuredCount = 0; this._fallbackCount = 0;
    this._missingGlyphs = new Set(); this._disposed = false;
  }
  resolveFont(styleName = 'STANDARD', fontFile = '') {
    if (this._disposed) throw new Error('StandardGlyphProvider has been disposed');
    const style = String(styleName || 'STANDARD');
    const file = String(fontFile || '');
    const key = JSON.stringify([style.toUpperCase(), file.toUpperCase()]);
    if (this._fontRegistry.has(key)) return this._fontRegistry.get(key);
    if (!file && this._fontRegistry.has(style.toUpperCase())) return this._fontRegistry.get(style.toUpperCase());
    const desc = { name: style, file: file || 'simplex.shx',
      isMonospace: /TXT|MONO|COUR/.test(file.toUpperCase()), isSynthetic: true,
      approximate: true, resourceVerified: false };
    this._fontRegistry.set(key, desc);
    return desc;
  }
  hasGlyph(char) {
    return !this._disposed && Object.prototype.hasOwnProperty.call(PROPORTIONAL_WIDTH_RATIOS, char);
  }
  getCharMetrics(char, options = {}) {
    if (this._disposed) throw new Error('StandardGlyphProvider has been disposed');
    const height = positiveNumber(options.height, 2.5);
    const widthFactor = positiveNumber(options.widthFactor, 1);
    const font = options.font || this.resolveFont(options.styleName, options.fontFile);
    const fallback = !this.hasGlyph(char);
    const ratio = font.isMonospace ? MONOSPACE_WIDTH_RATIO : fallback ? DEFAULT_FALLBACK_RATIO : PROPORTIONAL_WIDTH_RATIOS[char];
    if (fallback) { this._fallbackCount++; this._missingGlyphs.add(char); }
    else this._measuredCount++;
    const width = height * ratio * widthFactor;
    if (!Number.isFinite(width)) throw new Error('Annotation metrics overflow');
    return { width, advance: width, ascent: height * .8, descent: height * .2, fallback, approximate: true };
  }
  measureText(text, options = {}) {
    if (this._disposed) throw new Error('StandardGlyphProvider has been disposed');
    const value = typeof text === 'string' ? text : '';
    const height = positiveNumber(options.height, 2.5);
    const widthFactor = positiveNumber(options.widthFactor, 1);
    const font = options.font || this.resolveFont(options.styleName, options.fontFile);
    const key = JSON.stringify([value,height,widthFactor,options.styleName,options.fontFile,font.name,font.file,Boolean(font.isMonospace)]);
    const copy = r => ({...r,charWidths:[...r.charWidths],missingGlyphs:[...r.missingGlyphs]});
    if (this._measureCache.has(key)) return copy(this._measureCache.get(key));
    const charWidths = [], missing = new Set();
    let width = 0;
    for (const char of value) {
      const m = this.getCharMetrics(char,{...options,height,widthFactor,font});
      width += m.advance; charWidths.push(m.advance); if (m.fallback) missing.add(char);
    }
    if (!Number.isFinite(width)) throw new Error('Annotation metrics overflow');
    const result = {width,height,advance:width,ascent:height*.8,descent:height*.2,
      hasMissingGlyphs:missing.size>0,missingGlyphs:[...missing],charWidths,
      approximate:true,fontResourceVerified:false};
    if (this._maxCacheSize > 0) {
      if (this._measureCache.size >= this._maxCacheSize) this._measureCache.delete(this._measureCache.keys().next().value);
      this._measureCache.set(key,result);
    }
    return copy(result);
  }
  getCoverageReport() {
    const total = this._measuredCount + this._fallbackCount;
    return { totalMeasured:this._measuredCount,totalFallback:this._fallbackCount,
      coverageRatio:total ? this._measuredCount/total : 1,missingGlyphCount:this._missingGlyphs.size,
      missingGlyphs:[...this._missingGlyphs],approximate:true,fontResourceVerified:false,
      reason:'Synthetic advance estimates; actual font outlines/resources not verified' };
  }
  dispose() {
    this._measureCache.clear(); this._fontRegistry.clear(); this._missingGlyphs.clear();
    this._disposed=true;
  }
  get isDisposed() { return this._disposed; }
}

/**
 * Singleton / factory for default glyph provider.
 * @returns {StandardGlyphProvider}
 */
export function createDefaultGlyphProvider(options) {
  return new StandardGlyphProvider(options);
}
