/**
 * runtime/cad/revision-queue.js
 *
 * Serial task execution queue for CAD document authority (Issue #92 / A04).
 * Enforces atomic sequential ordering of commands, requests, and projections,
 * with cancellation semantics and error boundaries.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { SessionErrorCode } from './session-envelope.js';

export class RevisionQueue {
  constructor() {
    this.queue = [];
    this.activeTask = null;
    this.processing = false;
    this.cancelledRequestIds = new Set();
    this.disposed = false;
  }

  /**
   * Enqueue an async work unit.
   *
   * @param {Function} taskFn - () => Promise<any>
   * @param {Object} [meta]
   * @param {string} [meta.requestId]
   * @returns {Promise<any>}
   */
  enqueue(taskFn, meta = {}) {
    if (this.disposed) {
      const err = new Error('RevisionQueue is disposed');
      err.code = SessionErrorCode.SESSION_DISPOSED;
      return Promise.reject(err);
    }

    const requestId = meta.requestId || null;

    return new Promise((resolve, reject) => {
      this.queue.push({
        taskFn,
        requestId,
        resolve,
        reject,
      });

      queueMicrotask(() => this._processNext());
    });
  }

  /**
   * Cancel a pending request by ID.
   *
   * @param {string} requestId
   * @returns {boolean} true if was in pending queue and cancelled before commit
   */
  cancel(requestId) {
    if (!requestId) return false;


    const pendingIdx = this.queue.findIndex((t) => t.requestId === requestId);
    if (pendingIdx !== -1) {
      const [cancelledTask] = this.queue.splice(pendingIdx, 1);
      const err = new Error(`Request ${requestId} cancelled before execution`);
      err.code = SessionErrorCode.REQUEST_CANCELLED;
      cancelledTask.reject(err);
      this.cancelledRequestIds.delete(requestId);
      return true;
    }

    return false;
  }

  /**
   * Internal queue processing loop.
   */
  async _processNext() {
    if (this.processing || this.queue.length === 0 || this.disposed) {
      return;
    }

    this.processing = true;
    const task = this.queue.shift();
    this.activeTask = task;

    try {
      // 1. Check if cancelled before starting
      if (task.requestId && this.cancelledRequestIds.has(task.requestId)) {
        this.cancelledRequestIds.delete(task.requestId);
        const err = new Error(`Request ${task.requestId} cancelled before execution`);
        err.code = SessionErrorCode.REQUEST_CANCELLED;
        task.reject(err);
      } else {
        // 2. Execute task atomically
        const result = await task.taskFn();

        // 3. If cancel was called after/during commit, the committed result is still returned
        // (Acceptance criterion: "cancellation after commit reports the committed result")
        task.resolve(result);
      }
    } catch (err) {
      task.reject(err);
    } finally {
      this.activeTask = null;
      this.processing = false;
      this._processNext();
    }
  }

  /**
   * Clear all queued tasks and reject with DISPOSED.
   */
  clear() {
    const error = new Error('Queue cleared');
    error.code = SessionErrorCode.SESSION_DISPOSED;

    for (const task of this.queue) {
      task.reject(error);
    }
    this.queue = [];
    this.cancelledRequestIds.clear();
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }
}
