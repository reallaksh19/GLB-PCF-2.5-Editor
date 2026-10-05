/**
 * formats/cad/semantic-links/index.js
 *
 * Source-link data structures, selection resolution, and index management.
 */

export { SourceRef, SemanticComponentRef } from './source-ref.js';
export { SemanticLinkManager } from './semantic-link-manager.js';
export {
  SemanticSelectionResolver,
  SemanticSelectionResult,
  SemanticSelectionError,
} from './semantic-selection.js';
