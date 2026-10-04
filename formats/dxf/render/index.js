/**
 * formats/dxf/render/index.js
 *
 * Public entry point for Phase 3 DXF Render Projection.
 */

export {
  RenderModel,
  sampleBulgeArc,
  sampleArc,
  sampleCircle,
  sampleEllipse,
  sampleSpline,
} from './dxf-geometry-sampler.js';

export { DxfRenderAdapter } from './dxf-render-adapter.js';

export {
  DXF_ACI_RGB,
  aciToRgb,
  rgbToHex,
  parseLineWeightMm,
  resolveLayerStyle,
  resolveEntityStyle,
} from './dxf-style-resolver.js';

export {
  MAX_BLOCK_DEPTH,
  createInsertTransform,
  transformPoint,
  composeTransforms,
  projectBlockInstance,
} from './dxf-block-renderer.js';

export {
  cleanMText,
  resolveTextGeometry,
  estimateTextBounds,
  projectTextPrimitive,
} from './dxf-text-renderer.js';
