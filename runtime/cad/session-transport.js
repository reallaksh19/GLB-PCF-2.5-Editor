/**
 * runtime/cad/session-transport.js
 *
 * Transport abstraction connecting DocumentSessionClient to DocumentAuthority (Issue #92 / A04).
 * Supports DirectSessionTransport (cooperative in-process / Node.js fallback) and
 * WorkerSessionTransport (real Web Worker / Worker thread).
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { DocumentAuthority } from './document-authority.js';
import { RevisionQueue } from './revision-queue.js';
import {
  EnvelopeType,
  SessionErrorCode,
  createResponseEnvelope,
  createErrorEnvelope,
} from './session-envelope.js';

export class DirectSessionTransport {
  constructor(options = {}) {
    this.mode = 'direct';
    this.authority = new DocumentAuthority(options);
    this.queue = new RevisionQueue();
    this.messageListeners = new Set();
    this.terminated = false;
  }

  /**
   * Subscribe to messages coming from the authority host.
   * @param {Function} listener - (envelope) => void
   * @returns {Function} unsubscribe
   */
  onMessage(listener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Send a request envelope to the authority host.
   * @param {Object} envelope
   */
  send(envelope) {
    if (this.terminated) return;

    // Handle cancel request synchronously before queue execution if possible
    if (envelope.type === EnvelopeType.CANCEL_REQUEST) {
      const targetRequestId = envelope.payload?.targetRequestId;
      const cancelled = this.queue.cancel(targetRequestId);
      this._emit(
        createResponseEnvelope({
          type: EnvelopeType.CANCEL_RESPONSE,
          documentId: this.authority.documentId,
          sourceRevision: this.authority.sourceRevision,
          requestId: envelope.requestId,
          data: { targetRequestId, cancelled },
        })
      );
      return;
    }

    // Enqueue task for serial processing
    this.queue.enqueue(async () => {
      if (this.terminated) return;

      try {
        switch (envelope.type) {
          case EnvelopeType.OPEN_REQUEST: {
            const summary = this.authority.open(envelope.payload || {});
            this._emit(
              createResponseEnvelope({
                type: EnvelopeType.OPEN_RESPONSE,
                documentId: this.authority.documentId,
                sourceRevision: this.authority.sourceRevision,
                requestId: envelope.requestId,
                data: summary,
              })
            );
            break;
          }

          case EnvelopeType.COMMAND_REQUEST: {
            const result = this.authority.executeCommand({
              command: envelope.payload.command,
              baseRevision: envelope.baseRevision,
              transactionId: envelope.payload.transactionId,
              payloadDigest: envelope.payload.payloadDigest,
            });
            this._emit(
              createResponseEnvelope({
                type: EnvelopeType.COMMAND_RESPONSE,
                documentId: this.authority.documentId,
                sourceRevision: result.sourceRevision,
                requestId: envelope.requestId,
                data: result,
              })
            );
            break;
          }

          case EnvelopeType.SAVE_REQUEST: {
            const saveResult = this.authority.save(envelope.payload || {});
            this._emit(
              createResponseEnvelope({
                type: EnvelopeType.SAVE_RESPONSE,
                documentId: this.authority.documentId,
                sourceRevision: saveResult.revision,
                requestId: envelope.requestId,
                data: saveResult,
              })
            );
            break;
          }

          case EnvelopeType.QUERY_REQUEST: {
            const queryResult = this.authority.query(
              envelope.payload.queryType,
              envelope.payload.params
            );
            this._emit(
              createResponseEnvelope({
                type: EnvelopeType.QUERY_RESPONSE,
                documentId: this.authority.documentId,
                sourceRevision: this.authority.sourceRevision,
                requestId: envelope.requestId,
                data: queryResult,
              })
            );
            break;
          }

          case EnvelopeType.CLOSE_REQUEST: {
            this.authority.close();
            this._emit(
              createResponseEnvelope({
                type: EnvelopeType.CLOSE_RESPONSE,
                documentId: null,
                sourceRevision: 0,
                requestId: envelope.requestId,
                data: { closed: true },
              })
            );
            break;
          }

          default:
            throw new Error(`Unsupported envelope type: ${envelope.type}`);
        }
      } catch (err) {
        this._emit(
          createErrorEnvelope({
            documentId: this.authority.documentId,
            sourceRevision: this.authority.sourceRevision,
            requestId: envelope.requestId,
            code: err.code || SessionErrorCode.EXECUTION_FAILED,
            message: err.message,
            details: {
              currentRevision: err.currentRevision,
              summary: err.summary,
            },
          })
        );
      }
    }, { requestId: envelope.requestId }).catch(() => {
      // Rejections already emitted as error envelopes
    });
  }

  /**
   * Terminate transport and dispose authority resources.
   */
  terminate() {
    this.terminated = true;
    this.queue.dispose();
    this.authority.dispose();
    this.messageListeners.clear();
  }

  _emit(responseEnvelope) {
    if (this.terminated) return;
    // Asynchronous dispatch simulating message channel
    queueMicrotask(() => {
      if (this.terminated) return;
      for (const listener of this.messageListeners) {
        try {
          listener(responseEnvelope);
        } catch (e) {
          // Swallow listener errors
        }
      }
    });
  }
}

/**
 * Worker-based transport wrapping standard Web Worker / Worker thread.
 */
export class WorkerSessionTransport {
  constructor(worker) {
    this.mode = 'worker';
    this.worker = worker;
    this.messageListeners = new Set();
    this.terminated = false;

    this._onWorkerMessage = (event) => {
      const data = event.data;
      if (!this.terminated && data) {
        for (const listener of this.messageListeners) {
          listener(data);
        }
      }
    };

    if (this.worker.addEventListener) {
      this.worker.addEventListener('message', this._onWorkerMessage);
    } else if (this.worker.on) {
      this.worker.on('message', this._onWorkerMessage);
    }
  }

  onMessage(listener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  send(envelope) {
    if (this.terminated) return;
    this.worker.postMessage(envelope);
  }

  terminate() {
    this.terminated = true;
    this.messageListeners.clear();
    if (typeof this.worker.terminate === 'function') {
      this.worker.terminate();
    }
  }
}
