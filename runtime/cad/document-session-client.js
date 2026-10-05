/**
 * runtime/cad/document-session-client.js
 *
 * Client handle managing communication with the document authority worker (Issue #92 / A04).
 * Enforces stale-result rejection, monotonic revision tracking, cancellation,
 * and observable disposal.
 *
 * Invariant: Does NOT store a mutable native AST on main thread.
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { DirectSessionTransport } from './session-transport.js';
import {
  EnvelopeType,
  SessionErrorCode,
  createRequestEnvelope,
  generateRequestId,
} from './session-envelope.js';

export class DocumentSessionClient {
  /**
   * @param {Object} [options]
   * @param {import('./session-transport.js').DirectSessionTransport|import('./session-transport.js').WorkerSessionTransport} [options.transport]
   */
  constructor(options = {}) {
    this.transport = options.transport || new DirectSessionTransport(options);
    this.documentId = null;
    this.currentRevision = 0;
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, envelope, targetRevision }
    this.latestSummary = null;
    this.disposed = false;

    this._unsubscribeTransport = this.transport.onMessage((envelope) => {
      this._handleInboundEnvelope(envelope);
    });
  }

  get isReady() {
    return !this.disposed && this.documentId !== null;
  }

  /**
   * Open a document asynchronously.
   *
   * @param {Object} params
   * @param {ArrayBuffer|Uint8Array|string} [params.source]
   * @param {string} [params.documentId]
   * @param {Object} [params.options]
   * @returns {Promise<Object>} initial summary
   */
  async openDocument(params = {}) {
    this._ensureNotDisposed();

    // Closing prior document marks previous pending requests stale
    if (this.documentId) {
      await this.closeDocument();
    }

    const envelope = createRequestEnvelope({
      type: EnvelopeType.OPEN_REQUEST,
      documentId: params.documentId || null,
      baseRevision: 0,
      payload: params,
    });

    const summary = await this._sendRequest(envelope);
    this.documentId = summary.documentId;
    this.currentRevision = summary.sourceRevision || 0;
    this.latestSummary = summary;
    return summary;
  }

  /**
   * Execute an atomic command on the document.
   *
   * @param {import('../../core/commands/cad/cad-command.js').CadCommand} command
   * @param {Object} [options]
   * @param {string} [options.transactionId]
   * @param {string} [options.payloadDigest]
   * @returns {Promise<Object>}
   */
  async executeCommand(command, options = {}) {
    this._ensureReady();

    const envelope = createRequestEnvelope({
      type: EnvelopeType.COMMAND_REQUEST,
      documentId: this.documentId,
      baseRevision: this.currentRevision,
      payload: {
        command,
        transactionId: options.transactionId || null,
        payloadDigest: options.payloadDigest || null,
      },
    });

    const result = await this._sendRequest(envelope);
    this.currentRevision = result.sourceRevision;
    return result;
  }

  /**
   * Save native document bytes.
   * @param {Object} [options]
   * @returns {Promise<{ bytes: Uint8Array, contentStateId: string, revision: number }>}
   */
  async saveDocument(options = {}) {
    this._ensureReady();

    const envelope = createRequestEnvelope({
      type: EnvelopeType.SAVE_REQUEST,
      documentId: this.documentId,
      baseRevision: this.currentRevision,
      payload: options,
    });

    return await this._sendRequest(envelope);
  }

  /**
   * Execute read-only query or projection.
   * @param {string} queryType
   * @param {*} [params]
   * @returns {Promise<*>}
   */
  async query(queryType, params = {}) {
    this._ensureReady();

    const envelope = createRequestEnvelope({
      type: EnvelopeType.QUERY_REQUEST,
      documentId: this.documentId,
      baseRevision: this.currentRevision,
      payload: { queryType, params },
    });

    return await this._sendRequest(envelope);
  }

  /**
   * Cancel an in-flight request.
   * @param {string} targetRequestId
   * @returns {Promise<boolean>}
   */
  async cancelRequest(targetRequestId) {
    if (!targetRequestId || this.disposed) return false;

    // Reject client pending promise immediately if found
    if (this.pendingRequests.has(targetRequestId)) {
      const pending = this.pendingRequests.get(targetRequestId);
      this.pendingRequests.delete(targetRequestId);
      const err = new Error(`Request ${targetRequestId} cancelled by client`);
      err.code = SessionErrorCode.REQUEST_CANCELLED;
      pending.reject(err);
    }

    // Notify authority transport
    const envelope = createRequestEnvelope({
      type: EnvelopeType.CANCEL_REQUEST,
      documentId: this.documentId,
      baseRevision: this.currentRevision,
      payload: { targetRequestId },
    });

    try {
      const resp = await this._sendRequest(envelope);
      return Boolean(resp?.cancelled);
    } catch {
      return false;
    }
  }

  /**
   * Close the active document session.
   * @returns {Promise<void>}
   */
  async closeDocument() {
    if (!this.documentId) return;

    const oldDocId = this.documentId;
    this.documentId = null;
    this.currentRevision = 0;
    this.latestSummary = null;

    // Reject all pending requests belonging to the closed document
    const err = new Error(`Document ${oldDocId} closed`);
    err.code = SessionErrorCode.DOCUMENT_NOT_FOUND;
    for (const [reqId, pending] of this.pendingRequests.entries()) {
      pending.reject(err);
      this.pendingRequests.delete(reqId);
    }

    const envelope = createRequestEnvelope({
      type: EnvelopeType.CLOSE_REQUEST,
      documentId: oldDocId,
      baseRevision: 0,
    });

    try {
      await this._sendRequest(envelope);
    } catch {
      // Ignore errors on close
    }
  }

  /**
   * Dispose client and underlying transport completely.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    // Cancel pending
    const err = new Error('DocumentSessionClient disposed');
    err.code = SessionErrorCode.SESSION_DISPOSED;
    for (const pending of this.pendingRequests.values()) {
      pending.reject(err);
    }
    this.pendingRequests.clear();

    if (this._unsubscribeTransport) {
      this._unsubscribeTransport();
      this._unsubscribeTransport = null;
    }

    if (this.transport) {
      this.transport.terminate();
    }

    this.documentId = null;
    this.currentRevision = 0;
    this.latestSummary = null;
  }

  _sendRequest(envelope) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(envelope.requestId, {
        resolve,
        reject,
        envelope,
        targetRevision: envelope.baseRevision,
        sentAt: Date.now(),
      });

      this.transport.send(envelope);
    });
  }

  _handleInboundEnvelope(envelope) {
    if (this.disposed) return;

    // 1. Stale Document Check:
    // If reply belongs to an old/different document, reject/drop it immediately!
    if (
      envelope.documentId &&
      this.documentId &&
      envelope.documentId !== this.documentId
    ) {
      // Dropped as stale cross-document reply
      return;
    }

    // 2. Correlate with pending request
    const pending = this.pendingRequests.get(envelope.requestId);
    if (!pending) {
      // Stale or already cancelled request reply
      return;
    }

    this.pendingRequests.delete(envelope.requestId);

    // 3. Stale Revision Projection Check:
    // Read/projection replies superseded by newer revision are discarded
    if (
      envelope.type === EnvelopeType.QUERY_RESPONSE &&
      envelope.sourceRevision < this.currentRevision
    ) {
      const staleErr = new Error('Query response superseded by newer document revision');
      staleErr.code = SessionErrorCode.STALE_REVISION;
      pending.reject(staleErr);
      return;
    }

    // 4. Error response
    if (envelope.type === EnvelopeType.ERROR_RESPONSE) {
      const err = new Error(envelope.error?.message || 'Session execution failed');
      err.code = envelope.error?.code || SessionErrorCode.EXECUTION_FAILED;
      err.details = envelope.error?.details || null;
      pending.reject(err);
      return;
    }

    // 5. Success
    if (envelope.sourceRevision) {
      this.currentRevision = Math.max(this.currentRevision, envelope.sourceRevision);
    }

    pending.resolve(envelope.data);
  }

  _ensureReady() {
    this._ensureNotDisposed();
    if (!this.documentId) {
      const error = new Error('No active document in session');
      error.code = SessionErrorCode.DOCUMENT_NOT_FOUND;
      throw error;
    }
  }

  _ensureNotDisposed() {
    if (this.disposed) {
      const error = new Error('DocumentSessionClient is disposed');
      error.code = SessionErrorCode.SESSION_DISPOSED;
      throw error;
    }
  }
}
