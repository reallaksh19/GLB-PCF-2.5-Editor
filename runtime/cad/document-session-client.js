/** Revisioned client: lifecycle generations prevent stale replies from restoring old sessions. */
import {DirectSessionTransport} from './session-transport.js';
import {EnvelopeType, SessionErrorCode, createRequestEnvelope, generateRequestId, validateEnvelope} from './session-envelope.js';
const error = (code, message) => Object.assign(new Error(message), {code});
export class DocumentSessionClient {
  constructor(options = {}) {
    this.transport = options.transport || new DirectSessionTransport(options);
    this.documentId = null;
    this.currentRevision = 0;
    this.pendingRequests = new Map();
    this.latestSummary = null;
    this.disposed = false;
    this.generation = 0;
    this._openingDocumentId = null;
    this._latestViews = new Map();
    this.maxPendingRequests = options.maxPendingRequests ?? 256;
    this._unsubscribeTransport = this.transport.onMessage(envelope => this._handleInboundEnvelope(envelope));
  }
  get isReady() { return !this.disposed && this.documentId !== null; }
  _invalidate(code = SessionErrorCode.REQUEST_CANCELLED) {
    this.generation++;
    for (const pending of this.pendingRequests.values()) pending.reject(error(code, 'Session lifecycle superseded'));
    this.pendingRequests.clear();
    this._latestViews.clear();
    this.documentId = null;
    this.currentRevision = 0;
    this.latestSummary = null;
  }
  async openDocument(params = {}) {
    this._ensureNotDisposed();
    const previous = {documentId:this.documentId, revision:this.currentRevision, summary:this.latestSummary};
    this._invalidate();
    const generation = this.generation;
    const documentId = params.documentId || 'session:' + generateRequestId();
    this._openingDocumentId = documentId;
    try {
      const summary = await this._sendRequest(createRequestEnvelope({type:EnvelopeType.OPEN_REQUEST, documentId, payload:{...params, documentId}}));
      if (this.disposed || generation !== this.generation) throw error(SessionErrorCode.REQUEST_CANCELLED, 'Open superseded');
      this.documentId = summary.documentId;
      this.currentRevision = summary.sourceRevision;
      this.latestSummary = summary;
      this._openingDocumentId = null;
      return summary;
    } catch (e) {
      if (!this.disposed && generation === this.generation) {
        this.documentId = previous.documentId;
        this.currentRevision = previous.revision;
        this.latestSummary = previous.summary;
        this._openingDocumentId = null;
      }
      throw e;
    }
  }
  async executeCommand(command, options = {}) {
    this._ensureReady();
    const result = await this._sendRequest(createRequestEnvelope({type:EnvelopeType.COMMAND_REQUEST,
      documentId:this.documentId, baseRevision:this.currentRevision,
      payload:{command, transactionId:options.transactionId || null, payloadDigest:options.payloadDigest || null}}));
    // Replays return the historical commit checkpoint; they must not rewind live revision.
    this.currentRevision = Math.max(this.currentRevision, result.sourceRevision);
    return result;
  }
  async saveDocument(options = {}) {
    this._ensureReady();
    return this._sendRequest(createRequestEnvelope({type:EnvelopeType.SAVE_REQUEST,
      documentId:this.documentId, baseRevision:this.currentRevision, payload:options}));
  }
  async query(queryType, params = {}) {
    this._ensureReady();
    const envelope = createRequestEnvelope({type:EnvelopeType.QUERY_REQUEST,
      documentId:this.documentId, baseRevision:this.currentRevision, payload:{queryType, params}});
    if (queryType === 'RENDER') this._latestViews.set(queryType, envelope.requestId);
    return this._sendRequest(envelope);
  }
  async cancelRequest(targetRequestId) {
    if (!targetRequestId || this.disposed) return false;
    try {
      const resp = await this._sendRequest(createRequestEnvelope({type:EnvelopeType.CANCEL_REQUEST,
        documentId:this.documentId || this._openingDocumentId, baseRevision:this.currentRevision, payload:{targetRequestId}}));
      if (resp?.cancelled) {
        const pending = this.pendingRequests.get(targetRequestId);
        if (pending) { this.pendingRequests.delete(targetRequestId); pending.reject(error(SessionErrorCode.REQUEST_CANCELLED, 'Cancelled before commit')); }
      }
      // A late cancel never hides an already committed result.
      return Boolean(resp?.cancelled);
    } catch { return false; }
  }
  async closeDocument() {
    const oldId = this.documentId || this._openingDocumentId;
    this._invalidate();
    this._openingDocumentId = null;
    if (!oldId || this.disposed) return;
    try { await this._sendRequest(createRequestEnvelope({type:EnvelopeType.CLOSE_REQUEST, documentId:oldId})); }
    catch { /* Closing is idempotent; local state already invalidated. */ }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._invalidate(SessionErrorCode.SESSION_DISPOSED);
    this._openingDocumentId = null;
    this._unsubscribeTransport?.();
    this._unsubscribeTransport = null;
    this.transport.terminate();
  }
  _sendRequest(envelope) {
    return new Promise((resolve, reject) => {
      if (this.pendingRequests.size >= this.maxPendingRequests) { reject(error(SessionErrorCode.EXECUTION_FAILED, 'Client request capacity exceeded')); return; }
      this.pendingRequests.set(envelope.requestId, {resolve, reject, envelope, generation:this.generation});
      try { this.transport.send(envelope); }
      catch (e) { this.pendingRequests.delete(envelope.requestId); reject(e); }
    });
  }
  _handleInboundEnvelope(envelope) {
    if (this.disposed || !envelope || typeof envelope !== 'object') return;
    const pending = this.pendingRequests.get(envelope.requestId);
    if (!pending) return;
    this.pendingRequests.delete(envelope.requestId);
    if (pending.generation !== this.generation) { pending.reject(error(SessionErrorCode.REQUEST_CANCELLED, 'Stale lifecycle reply')); return; }
    const valid = validateEnvelope(envelope);
    if (!valid.valid) { pending.reject(error(SessionErrorCode.INVALID_ENVELOPE, valid.error)); return; }
    const request = pending.envelope;
    if (envelope.type === EnvelopeType.ERROR_RESPONSE) {
      pending.reject(Object.assign(error(envelope.error?.code || SessionErrorCode.EXECUTION_FAILED,
        envelope.error?.message || 'Session execution failed'), {details:envelope.error?.details || null})); return;
    }
    if (envelope.type !== request.type.replace('_REQUEST', '_RESPONSE')) {
      pending.reject(error(SessionErrorCode.INVALID_ENVELOPE, 'Unexpected response type')); return;
    }
    if (request.type !== EnvelopeType.CLOSE_REQUEST && envelope.documentId !== request.documentId) {
      pending.reject(error(SessionErrorCode.DOCUMENT_NOT_FOUND, 'Reply targets another document')); return;
    }
    if (envelope.type === EnvelopeType.QUERY_RESPONSE && (envelope.sourceRevision < this.currentRevision ||
        (request.payload.queryType === 'RENDER' && this._latestViews.get('RENDER') !== envelope.requestId))) {
      pending.reject(error(SessionErrorCode.STALE_REVISION, 'Projection superseded')); return;
    }
    if (![EnvelopeType.OPEN_RESPONSE, EnvelopeType.CLOSE_RESPONSE].includes(envelope.type))
      this.currentRevision = Math.max(this.currentRevision, envelope.sourceRevision);
    pending.resolve(envelope.data);
  }
  _ensureReady() {
    this._ensureNotDisposed();
    if (!this.documentId) throw error(SessionErrorCode.DOCUMENT_NOT_FOUND, 'No active document');
  }
  _ensureNotDisposed() {
    if (this.disposed) throw error(SessionErrorCode.SESSION_DISPOSED, 'Client disposed');
  }
}
