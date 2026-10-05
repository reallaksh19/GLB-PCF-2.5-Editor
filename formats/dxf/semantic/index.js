/**
 * formats/dxf/semantic/index.js
 *
 * Optional CAD piping semantic recognition and projection engine.
 */

export {
  RECOGNITION_POLICY_VERSION,
  RecognitionPolicy,
  createDefaultRecognitionPolicy,
} from './recognition-policy.js';

export {
  SemanticProjectionResult,
  derivePipingCegFromDxfDocument,
} from './piping-semantic-projector.js';
