/**
 * formats/dxf/render/annotations/index.js
 *
 * Source-native CAD annotation layout and glyph projection package.
 */

export {
  GlyphProvider,
  StandardGlyphProvider,
  createDefaultGlyphProvider,
} from './glyph-provider.js';

export {
  cleanMTextFormatting,
  parseMTextRuns,
  layoutTextEntity,
  layoutMTextEntity,
} from './text-layout-engine.js';

export {
  projectAnnotation,
} from './annotation-projector.js';
