/**
 * runtime/cad/session-envelope.js
 *
 * Envelope and messaging protocol for worker-owned CAD document sessions (Issue #92 / A04).
 * Enforces immutable, revision-correlated communication between main-thread client
 * and document worker authority.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

export const EnvelopeType = Object.freeze({
  OPEN_REQUEST: 'OPEN_REQUEST',
  OPEN_RESPONSE: 'OPEN_RESPONSE',
  COMMAND_REQUEST: 'COMMAND_REQUEST',
  COMMAND_RESPONSE: 'COMMAND_RESPONSE',
  SAVE_REQUEST: 'SAVE_REQUEST',
  SAVE_RESPONSE: 'SAVE_RESPONSE',
  QUERY_REQUEST: 'QUERY_REQUEST',
  QUERY_RESPONSE: 'QUERY_RESPONSE',
  CANCEL_REQUEST: 'CANCEL_REQUEST',
  CANCEL_RESPONSE: 'CANCEL_RESPONSE',
  CLOSE_REQUEST: 'CLOSE_REQUEST',
  CLOSE_RESPONSE: 'CLOSE_RESPONSE',
  EVENT_NOTIFICATION: 'EVENT_NOTIFICATION',
  ERROR_RESPONSE: 'ERROR_RESPONSE',
});

export const SessionErrorCode = Object.freeze({
  STALE_REVISION: 'STALE_REVISION',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  TRANSACTION_CONFLICT: 'TRANSACTION_CONFLICT',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  SESSION_DISPOSED: 'SESSION_DISPOSED',
  INVALID_ENVELOPE: 'INVALID_ENVELOPE',
});

let nextRequestId = 1;

/**
 * Generate a monotonically increasing request ID.
 * @returns {string}
 */
export function generateRequestId() {
  return `req:${Date.now()}:${nextRequestId++}`;
}

/**
 * Create a standardized request envelope.
 *
 * @param {Object} params
 * @param {string} params.type - One of EnvelopeType
 * @param {string} [params.documentId] - Target document identifier
 * @param {number} [params.baseRevision] - Client base revision
 * @param {string} [params.requestId] - Correlation identifier
 * @param {*} [params.payload] - Request payload
 * @returns {Object}
 */
export function createRequestEnvelope({
  type,
  documentId = null,
  baseRevision = 0,
  requestId = null,
  payload = null,
}) {
  return {
    type,
    documentId,
    baseRevision: Number(baseRevision) || 0,
    requestId: requestId || generateRequestId(),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create a standardized response envelope.
 *
 * @param {Object} params
 * @param {string} params.type - One of EnvelopeType
 * @param {string} params.documentId - Document identifier
 * @param {number} params.sourceRevision - Authoritative document revision
 * @param {string} params.requestId - Correlation identifier matching the request
 * @param {*} [params.data] - Response payload
 * @returns {Object}
 */
export function createResponseEnvelope({
  type,
  documentId,
  sourceRevision,
  requestId,
  data = null,
}) {
  return {
    type,
    documentId,
    sourceRevision: Number(sourceRevision) || 0,
    requestId,
    timestamp: Date.now(),
    data,
  };
}

/**
 * Create a standardized error envelope.
 *
 * @param {Object} params
 * @param {string} [params.documentId]
 * @param {number} [params.sourceRevision]
 * @param {string} params.requestId
 * @param {string} params.code - One of SessionErrorCode
 * @param {string} params.message
 * @param {*} [params.details]
 * @returns {Object}
 */
export function createErrorEnvelope({
  documentId = null,
  sourceRevision = 0,
  requestId,
  code,
  message,
  details = null,
}) {
  return {
    type: EnvelopeType.ERROR_RESPONSE,
    documentId,
    sourceRevision: Number(sourceRevision) || 0,
    requestId,
    timestamp: Date.now(),
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Validate that an envelope meets structural requirements.
 * @param {Object} envelope
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, error: 'Envelope must be a non-null object' };
  }
  if (!envelope.type || !EnvelopeType[envelope.type]) {
    return { valid: false, error: `Invalid envelope type: ${envelope.type}` };
  }
  if (!envelope.requestId) {
    return { valid: false, error: 'Envelope missing requestId' };
  }
  return { valid: true };
}
