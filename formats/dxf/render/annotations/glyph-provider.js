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
 * Based on AutoCAD SIMPLEX / ROMANS stroke-font geometry.
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
 * Production implementation of GlyphProvider using verified CAD font metrics tables.
 */
export class StandardGlyphProvider extends GlyphProvider {
  /**
   * @param {Object} [options]
   * @param {Map<string, Object>} [options.fontRegistry]
   * @param {number} [options.maxCacheSize=10000]
   */
  constructor(options = {}) {
    super();
    this._fontRegistry = options.fontRegistry || new Map();
    this._maxCacheSize = options.maxCacheSize || 10000;
    this._measureCache = new Map();
    this._measuredCount = 0;
    this._fallbackCount = 0;
    this._missingGlyphs = new Set();
    this._disposed = false;
  }

  /**
   * Resolve font style name and file.
   * @param {string} [styleName='STANDARD']
   * @param {string} [fontFile='']
   * @returns {{name: string, file: string, isMonospace: boolean, isSynthetic: boolean}}
   */
  resolveFont(styleName = 'STANDARD', fontFile = '') {
    if (this._disposed) throw new Error('StandardGlyphProvider has been disposed');
    const key = (styleName || 'STANDARD').toUpperCase();
    if (this._fontRegistry.has(key)) {
      return this._fontRegistry.get(key);
    }

    const fileUpper = (fontFile || '').toUpperCase();
    const isMonospace = fileUpper.includes('TXT') || fileUpper.includes('MONO') || fileUpper.includes('COUR');
    const isSynthetic = !fontFile || fileUpper.includes('SIMPLEX') || fileUpper.includes('STANDARD');

    const desc = {
      name: styleName || 'STANDARD',
      file: fontFile || 'simplex.shx',
      isMonospace,
      isSynthetic,
    };
    this._fontRegistry.set(key, desc);
    return desc;
  }

  /**
   * Check if a glyph has explicit metrics.
   * @param {string} char
   * @param {string} [fontName]
   * @returns {boolean}
   */
  hasGlyph(char, fontName) {
    if (this._disposed) return false;
    return Object.prototype.hasOwnProperty.call(PROPORTIONAL_WIDTH_RATIOS, char);
  }

  /**
   * Get metrics for a single character.
   * @param {string} char
   * @param {Object} [options]
   * @returns {{width: number, ascent: number, descent: number, advance: number, fallback: boolean}}
   */
  getCharMetrics(char, options = {}) {
    if (this._disposed) throw new Error('StandardGlyphProvider has been disposed');
    const height = Math.max(0.001, Number(options.height) || 2.5);
    const widthFactor = Number.isFinite(Number(options.widthFactor)) ? Number(options.widthFactor) : 1.0;
    const font = options.font || this.resolveFont(options.styleName, options.fontFile);

    let ratio;
    let fallback = false;

    if (font.isMonospace) {
      ratio = MONOSPACE_WIDTH_RATIO;
    } else if (Object.prototype.hasOwnProperty.call(PROPORTIONAL_WIDTH_RATIOS, char)) {
      ratio = PROPORTIONAL_WIDTH_RATIOS[char];
    } else {
      ratio = DEFAULT_FALLBACK_RATIO;
      fallback = true;
      this._missingGlyphs.add(char);
    }

    if (fallback) {
      this._fallbackCount++;
    } else {
      this._measuredCount++;
    }

    const width = height * ratio * widthFactor;
    const ascent = height * 0.8;
    const descent = height * 0.2;
    const advance = width;

    return {
      width,
      ascent,
      descent,
      advance,
      fallback,
    };
  }

  /**
   * Measure a sequence of characters.
   * @param {string} text
   * @param {Object} [options]
   * @returns {{width: number, height: number, advance: number, ascent: number, descent: number, hasMissingGlyphs: boolean, missingGlyphs: string[], charWidths: number[]}}
   */
  measureText(text, options = {}) {
    if (this._disposed) throw new Error('StandardGlyphProvider has been disposed');
    if (!text || typeof text !== 'string') {
      return {
        width: 0,
        height: Math.max(0.001, Number(options.height) || 2.5),
        advance: 0,
        ascent: (Number(options.height) || 2.5) * 0.8,
        descent: (Number(options.height) || 2.5) * 0.2,
        hasMissingGlyphs: false,
        missingGlyphs: [],
        charWidths: [],
      };
    }

    const height = Math.max(0.001, Number(options.height) || 2.5);
    const widthFactor = Number.isFinite(Number(options.widthFactor)) ? Number(options.widthFactor) : 1.0;
    const styleName = options.styleName || 'STANDARD';
    const cacheKey = `${text}:${height}:${widthFactor}:${styleName}`;

    if (this._measureCache.has(cacheKey)) {
      return this._measureCache.get(cacheKey);
    }

    let totalWidth = 0;
    let hasMissing = false;
    const missing = [];
    const charWidths = [];

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const m = this.getCharMetrics(c, { ...options, height, widthFactor });
      totalWidth += m.advance;
      charWidths.push(m.advance);
      if (m.fallback) {
        hasMissing = true;
        if (!missing.includes(c)) missing.push(c);
      }
    }

    const result = {
      width: totalWidth,
      height,
      advance: totalWidth,
      ascent: height * 0.8,
      descent: height * 0.2,
      hasMissingGlyphs: hasMissing,
      missingGlyphs: missing,
      charWidths,
    };

    if (this._measureCache.size >= this._maxCacheSize) {
      // Evict oldest entries
      const firstKey = this._measureCache.keys().next().value;
      if (firstKey !== undefined) this._measureCache.delete(firstKey);
    }
    this._measureCache.set(cacheKey, result);

    return result;
  }

  /**
   * Return coverage summary.
   * @returns {{totalMeasured: number, totalFallback: number, coverageRatio: number, missingGlyphCount: number, missingGlyphs: string[]}}
   */
  getCoverageReport() {
    const total = this._measuredCount + this._fallbackCount;
    const ratio = total > 0 ? this._measuredCount / total : 1.0;
    return {
      totalMeasured: this._measuredCount,
      totalFallback: this._fallbackCount,
      coverageRatio: ratio,
      missingGlyphCount: this._missingGlyphs.size,
      missingGlyphs: Array.from(this._missingGlyphs),
    };
  }

  /**
   * Dispose cached data and mark provider as disposed.
   */
  dispose() {
    this._measureCache.clear();
    this._fontRegistry.clear();
    this._missingGlyphs.clear();
    this._disposed = true;
  }

  /**
   * Check if disposed.
   * @returns {boolean}
   */
  get isDisposed() {
    return this._disposed;
  }
}

/**
 * Singleton / factory for default glyph provider.
 * @returns {StandardGlyphProvider}
 */
export function createDefaultGlyphProvider(options) {
  return new StandardGlyphProvider(options);
}
