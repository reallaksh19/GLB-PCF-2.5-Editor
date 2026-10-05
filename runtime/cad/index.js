/**
 * runtime/cad/index.js
 *
 * Public module exports for the CAD runtime session foundation (Issue #92 / A04).
 */

export {
  EnvelopeType,
  SessionErrorCode,
  createRequestEnvelope,
  createResponseEnvelope,
  createErrorEnvelope,
  generateRequestId,
  validateEnvelope,
} from './session-envelope.js';

export { DocumentAuthority } from './document-authority.js';
export { RevisionQueue } from './revision-queue.js';
export { DirectSessionTransport, WorkerSessionTransport } from './session-transport.js';
export { DocumentSessionClient } from './document-session-client.js';
