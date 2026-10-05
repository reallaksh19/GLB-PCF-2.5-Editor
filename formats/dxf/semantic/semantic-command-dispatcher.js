/**
 * formats/dxf/semantic/semantic-command-dispatcher.js
 *
 * Source-linked semantic command dispatcher.
 * Resolves derived semantic operations to exact native CAD entity IDs and dispatches
 * supported native commands through the authoritative A09 command/history port
 * without creating or maintaining an independently writable CEG.
 *
 * Pure JS: zero DOM, zero Node runtime imports, zero Three.js.
 */

import {
  SemanticSelectionResolver,
  SemanticSelectionResult,
  SemanticSelectionError,
} from '../../cad/semantic-links/semantic-selection.js';
import {
  MoveEntitiesCommand,
  RotateEntitiesCommand,
  ScaleEntitiesCommand,
  DeleteEntitiesCommand,
  ChangeLayerCommand,
  ChangePropertiesCommand,
} from '../../../core/commands/cad/index.js';

/**
 * Dedicated error class for semantic dispatch failures.
 */
export class SemanticCommandDispatchError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {Object} [details={}]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SemanticCommandDispatchError';
    this.code = code;
    this.details = details;
    Object.assign(this, details);
  }
}

/**
 * Immutable container for semantic dispatch results.
 */
export class SemanticDispatchResult {
  /**
   * @param {Object} params
   */
  constructor({
    operationType,
    nativeCommand,
    changeSet,
    resolvedSelection,
    documentId,
    resultRevision,
  }) {
    this.operationType = operationType;
    this.nativeCommand = nativeCommand;
    this.changeSet = changeSet;
    this.resolvedSelection = resolvedSelection;
    this.documentId = documentId;
    this.resultRevision = resultRevision;
  }

  get affectedEntityIds() {
    return this.resolvedSelection?.nativeEntityIds || [];
  }

  get affectedComponentIds() {
    return this.resolvedSelection?.components?.map(c => c.componentId) || [];
  }

  toJSON() {
    return {
      operationType: this.operationType,
      commandName: this.nativeCommand?.name,
      documentId: this.documentId,
      resultRevision: this.resultRevision,
      affectedEntityIds: this.affectedEntityIds,
      affectedComponentIds: this.affectedComponentIds,
      changeSetSummary: this.changeSet ? {
        name: this.changeSet.name,
        modifiedCount: this.changeSet.modified?.size ?? 0,
        addedCount: this.changeSet.added?.size ?? 0,
        deletedCount: this.changeSet.deleted?.size ?? 0,
      } : null,
    };
  }
}

/**
 * Dispatcher mapping semantic operations to authoritative native CAD commands.
 */
export class SemanticCommandDispatcher {
  /**
   * @param {Object} options
   * @param {SemanticSelectionResolver} options.selectionResolver
   * @param {Object} [options.commandHistory] - A09 CommandHistory instance (optional)
   */
  constructor({ selectionResolver, commandHistory = null }) {
    if (!selectionResolver || !(selectionResolver instanceof SemanticSelectionResolver)) {
      throw new Error('SemanticCommandDispatcher requires a valid SemanticSelectionResolver');
    }
    this.selectionResolver = selectionResolver;
    this.commandHistory = commandHistory;
  }

  /**
   * Dispatches a semantic operation against the native document.
   *
   * Supported operation types:
   * - 'MOVE': { target, dx, dy, dz? }
   * - 'ROTATE': { target, center, angleDeg }
   * - 'SCALE': { target, center, sx, sy, sz? }
   * - 'DELETE': { target }
   * - 'CHANGE_LAYER': { target, targetLayer }
   * - 'CHANGE_PROPERTIES': { target, properties }
   *
   * @param {Object} operation
   * @param {string} operation.type
   * @param {string|Array<string>|SemanticComponentRef|Array<SemanticComponentRef>} operation.target
   * @param {Object} document - Authoritative DxfDocument
   * @param {Object} [options]
   * @returns {SemanticDispatchResult}
   */
  dispatch(operation, document, options = {}) {
    if (!operation || typeof operation.type !== 'string') {
      throw new SemanticCommandDispatchError(
        'Operation with a valid type string is required',
        'INVALID_OPERATION'
      );
    }

    if (!document) {
      throw new SemanticCommandDispatchError(
        'Authoritative document is required for command dispatch',
        'MISSING_DOCUMENT'
      );
    }

    // Step 1: Resolve selection to exact native IDs with pre-mutation verification
    const resolution = this.selectionResolver.resolve(operation.target, document, options);
    if (resolution.count === 0) {
      throw new SemanticCommandDispatchError(
        'Cannot dispatch command: selection resolved to zero native entities',
        'EMPTY_SELECTION'
      );
    }

    const nativeIds = [...resolution.nativeEntityIds];
    let nativeCommand = null;

    // Step 2: Instantiate supported native CAD command
    switch (operation.type.toUpperCase()) {
      case 'MOVE': {
        const dx = Number(operation.dx) || 0;
        const dy = Number(operation.dy) || 0;
        const dz = Number(operation.dz) || 0;
        nativeCommand = new MoveEntitiesCommand(nativeIds, dx, dy, dz);
        break;
      }
      case 'ROTATE': {
        const center = operation.center || { x: 0, y: 0, z: 0 };
        const angleDeg = Number(operation.angleDeg) || 0;
        nativeCommand = new RotateEntitiesCommand(nativeIds, center, angleDeg);
        break;
      }
      case 'SCALE': {
        const center = operation.center || { x: 0, y: 0, z: 0 };
        const sx = Number(operation.sx) || 1;
        const sy = Number(operation.sy) || 1;
        const sz = operation.sz != null ? Number(operation.sz) : 1;
        nativeCommand = new ScaleEntitiesCommand(nativeIds, center, sx, sy, sz);
        break;
      }
      case 'DELETE': {
        nativeCommand = new DeleteEntitiesCommand(nativeIds);
        break;
      }
      case 'CHANGE_LAYER': {
        if (!operation.targetLayer || typeof operation.targetLayer !== 'string') {
          throw new SemanticCommandDispatchError(
            'CHANGE_LAYER operation requires a non-empty string targetLayer',
            'INVALID_ARGUMENT',
            { operation }
          );
        }
        nativeCommand = new ChangeLayerCommand(nativeIds, operation.targetLayer);
        break;
      }
      case 'CHANGE_PROPERTIES': {
        if (!operation.properties || typeof operation.properties !== 'object') {
          throw new SemanticCommandDispatchError(
            'CHANGE_PROPERTIES operation requires a properties object',
            'INVALID_ARGUMENT',
            { operation }
          );
        }
        nativeCommand = new ChangePropertiesCommand(nativeIds, operation.properties);
        break;
      }
      default: {
        throw new SemanticCommandDispatchError(
          `Unsupported semantic command operation: "${operation.type}". Operation is not supported by native CAD command set.`,
          'UNSUPPORTED_OPERATION',
          { operationType: operation.type }
        );
      }
    }

    // Step 3: Execute through A09 command history port or directly on document
    let changeSet = null;
    if (this.commandHistory) {
      changeSet = this.commandHistory.execute(nativeCommand, document);
    } else {
      changeSet = nativeCommand.execute(document);
    }

    const resultRevision = document.sourceRevision ?? document.revision ?? 0;

    return new SemanticDispatchResult({
      operationType: operation.type.toUpperCase(),
      nativeCommand,
      changeSet,
      resolvedSelection: resolution,
      documentId: document.id,
      resultRevision,
    });
  }
}
