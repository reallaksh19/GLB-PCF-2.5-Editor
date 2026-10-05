/**
 * runtime/cad/document-authority.js
 *
 * Single mutable authority owning the native CAD document in session (Issue #92 / A04).
 * Enforces atomic execution, monotonic revisions, transaction replay/conflict guards,
 * buffer lifetime guarantees, and read-only projection extraction.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { DxfDocumentParser } from '../../formats/dxf/parser/dxf-document-parser.js';
import { DxfDocumentWriter } from '../../formats/dxf/writer/dxf-document-writer.js';
import { DxfDocument } from '../../formats/dxf/model/dxf-document.js';
import { CommandHistory } from '../../core/commands/cad/command-history.js';
import { DxfRenderAdapter } from '../../formats/dxf/render/dxf-render-adapter.js';
import { SessionErrorCode } from './session-envelope.js';

let nextDocId = 1;

export class DocumentAuthority {
  constructor(options = {}) {
    this.document = null;
    this.documentId = null;
    this.sourceRevision = 0;
    this.commandHistory = new CommandHistory();
    this.committedTransactions = new Map(); // transactionId -> { result, payloadDigest, revision }
    this.originalBytes = null;
    this.status = 'CLOSED';
    this.options = { ...options };
  }

  get isReady() {
    return this.status === 'READY' && this.document !== null;
  }

  /**
   * Open a document from byte input or empty template.
   *
   * @param {Object} params
   * @param {ArrayBuffer|Uint8Array|string} [params.source]
   * @param {string} [params.documentId]
   * @param {Object} [params.options]
   * @returns {Object} initial summary
   */
  open({ source = null, documentId = null, options = {} } = {}) {
    this.close();

    const assignedId = documentId || `doc:dxf:${Date.now()}:${nextDocId++}`;

    if (source) {
      const bytes = source instanceof Uint8Array
        ? source
        : typeof source === 'string'
        ? new TextEncoder().encode(source)
        : new Uint8Array(source);

      // Copy input bytes to preserve backing buffer
      const safeCopy = new Uint8Array(bytes.length);
      safeCopy.set(bytes);
      this.originalBytes = safeCopy;

      this.document = DxfDocumentParser.parse(safeCopy, {
        documentId: assignedId,
        ...options,
      });
    } else {
      this.document = new DxfDocument({ id: assignedId });
      this.originalBytes = null;
    }

    this.documentId = assignedId;
    this.sourceRevision = 0;
    this.commandHistory = new CommandHistory();
    this.committedTransactions.clear();
    this.status = 'READY';

    return this.getSummary();
  }

  /**
   * Execute an atomic mutating command.
   *
   * @param {Object} params
   * @param {import('../../core/commands/cad/cad-command.js').CadCommand} params.command
   * @param {number} params.baseRevision - Current revision client believes it is editing
   * @param {string} [params.transactionId] - Optional idempotency key
   * @param {string} [params.payloadDigest] - Checksum/hash of command parameters
   * @returns {Object} Execution result
   */
  executeCommand({ command, baseRevision, transactionId = null, payloadDigest = null }) {
    this._ensureReady();

    // 1. Idempotency Check: already committed?
    if (transactionId && this.committedTransactions.has(transactionId)) {
      const recorded = this.committedTransactions.get(transactionId);
      if (payloadDigest && recorded.payloadDigest && recorded.payloadDigest !== payloadDigest) {
        const error = new Error(`Transaction ${transactionId} already committed with conflicting payload`);
        error.code = SessionErrorCode.TRANSACTION_CONFLICT;
        throw error;
      }
      return recorded.result;
    }

    // 2. Base Revision Check: stale command?
    if (baseRevision !== this.sourceRevision) {
      const error = new Error(
        `Stale base revision ${baseRevision}; authority is currently at revision ${this.sourceRevision}`
      );
      error.code = SessionErrorCode.STALE_REVISION;
      error.currentRevision = this.sourceRevision;
      error.summary = this.getSummary();
      throw error;
    }

    // 3. Atomic Execution
    const changeSet = this.commandHistory.execute(command, this.document);

    // 4. Advance Monotonic Revision once
    this.sourceRevision++;
    this.document.revision = this.sourceRevision;

    const result = {
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      changeSet,
      contentStateId: this.document.contentStateId,
      dirty: this.document.dirty,
    };

    // 5. Record idempotent transaction
    if (transactionId) {
      this.committedTransactions.set(transactionId, {
        result,
        payloadDigest,
        revision: this.sourceRevision,
      });
    }

    return result;
  }

  /**
   * Undo last command.
   * @param {number} baseRevision
   * @returns {Object}
   */
  undo(baseRevision) {
    this._ensureReady();
    if (baseRevision !== this.sourceRevision) {
      const error = new Error(`Stale revision for undo: ${baseRevision} !== ${this.sourceRevision}`);
      error.code = SessionErrorCode.STALE_REVISION;
      throw error;
    }

    const changeSet = this.commandHistory.undo(this.document);
    this.sourceRevision++;
    this.document.revision = this.sourceRevision;

    return {
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      changeSet,
      contentStateId: this.document.contentStateId,
      dirty: this.document.dirty,
      canUndo: this.commandHistory.canUndo,
      canRedo: this.commandHistory.canRedo,
    };
  }

  /**
   * Redo previously undone command.
   * @param {number} baseRevision
   * @returns {Object}
   */
  redo(baseRevision) {
    this._ensureReady();
    if (baseRevision !== this.sourceRevision) {
      const error = new Error(`Stale revision for redo: ${baseRevision} !== ${this.sourceRevision}`);
      error.code = SessionErrorCode.STALE_REVISION;
      throw error;
    }

    const changeSet = this.commandHistory.redo(this.document);
    this.sourceRevision++;
    this.document.revision = this.sourceRevision;

    return {
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      changeSet,
      contentStateId: this.document.contentStateId,
      dirty: this.document.dirty,
      canUndo: this.commandHistory.canUndo,
      canRedo: this.commandHistory.canRedo,
    };
  }

  /**
   * Save native document bytes.
   * Invariant: Never detaches or mutates this.originalBytes or backing document state.
   *
   * @param {Object} [options]
   * @returns {{ bytes: Uint8Array, contentStateId: string, revision: number }}
   */
  save(options = {}) {
    this._ensureReady();

    const output = DxfDocumentWriter.writeBytes(this.document, options);

    // Return a defensive copy to guarantee transfer doesn't detach worker state
    const safeOutput = new Uint8Array(output.length);
    safeOutput.set(output);

    return {
      documentId: this.documentId,
      revision: this.sourceRevision,
      contentStateId: this.document.contentStateId,
      bytes: safeOutput,
    };
  }

  /**
   * Execute read-only projection/query.
   *
   * @param {string} queryType
   * @param {*} [params]
   * @returns {*}
   */
  query(queryType, params = {}) {
    this._ensureReady();

    switch (queryType) {
      case 'SUMMARY':
        return this.getSummary();

      case 'RENDER': {
        const renderModel = DxfRenderAdapter.buildRenderModel(this.document);
        return {
          documentId: this.documentId,
          sourceRevision: this.sourceRevision,
          renderModel,
        };
      }

      case 'LAYERS': {
        const layerMap = this.document.tables?.layers || new Map();
        const layers = Array.from(layerMap.values()).map((l) => ({
          name: l.name,
          color: l.color,
          visible: l.visible !== false,
          locked: Boolean(l.locked),
          frozen: Boolean(l.frozen),
        }));
        return { documentId: this.documentId, sourceRevision: this.sourceRevision, layers };
      }

      default:
        throw new Error(`Unsupported queryType: ${queryType}`);
    }
  }

  /**
   * Produce lightweight read-only summary for main thread.
   */
  getSummary() {
    if (!this.document) {
      return {
        documentId: this.documentId,
        sourceRevision: this.sourceRevision,
        status: this.status,
      };
    }

    const layerMap = this.document.tables?.layers || new Map();
    const blockMap = this.document.blocks || new Map();

    return {
      documentId: this.documentId,
      sourceRevision: this.sourceRevision,
      status: this.status,
      entityCount: Array.isArray(this.document.entities) ? this.document.entities.length : 0,
      layerCount: layerMap.size || 0,
      blockCount: blockMap.size || 0,
      dirty: Boolean(this.document.dirty),
      contentStateId: this.document.contentStateId,
      canUndo: Boolean(this.commandHistory?.canUndo),
      canRedo: Boolean(this.commandHistory?.canRedo),
    };
  }

  close() {
    this.document = null;
    this.documentId = null;
    this.sourceRevision = 0;
    this.commandHistory = new CommandHistory();
    this.committedTransactions.clear();
    this.originalBytes = null;
    this.status = 'CLOSED';
  }

  dispose() {
    this.close();
    this.status = 'DISPOSED';
  }

  _ensureReady() {
    if (this.status !== 'READY' || !this.document) {
      const error = new Error(`Document authority is not ready (status=${this.status})`);
      error.code = SessionErrorCode.DOCUMENT_NOT_FOUND;
      throw error;
    }
  }
}
