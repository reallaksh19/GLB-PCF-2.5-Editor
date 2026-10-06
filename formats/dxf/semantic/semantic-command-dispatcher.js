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
} from '../../../core/commands/cad/transform-commands.js';
import {
  DeleteEntitiesCommand,
  ChangeLayerCommand,
  ChangePropertiesCommand,
} from '../../../core/commands/cad/entity-modify-commands.js';

function finiteOperand(value, fallback, name) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new SemanticCommandDispatchError(
      `Invalid finite numeric operand: ${name}`,
      'INVALID_ARGUMENT',
      { operand: name, value }
    );
  }
  return number;
}

function scaleOperands(operation) {
  const alias = operation.scaleFactor ?? operation.scale;
  const aliasObject = alias && typeof alias === 'object' ? alias : null;
  const scalar = aliasObject ? undefined : alias;
  return {
    sx: finiteOperand(operation.sx ?? aliasObject?.x ?? scalar, 1, 'sx'),
    sy: finiteOperand(operation.sy ?? aliasObject?.y ?? scalar, 1, 'sy'),
    sz: finiteOperand(operation.sz ?? aliasObject?.z ?? scalar, 1, 'sz'),
  };
}

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

    // Step 1: Resolve selection to exact native IDs with pre-mutation verification.
    // Mutation of derived occurrence paths is not supported in this bounded milestone.
    const resolution = this.selectionResolver.resolve(operation.target, document, {
      ...options,
      allowOccurrence: false,
    });
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
        const dx = finiteOperand(operation.dx ?? operation.delta?.x, 0, 'dx');
        const dy = finiteOperand(operation.dy ?? operation.delta?.y, 0, 'dy');
        const dz = finiteOperand(operation.dz ?? operation.delta?.z, 0, 'dz');
        nativeCommand = new MoveEntitiesCommand(nativeIds, dx, dy, dz);
        break;
      }
      case 'ROTATE': {
        const center = operation.center || { x: 0, y: 0, z: 0 };
        const angleDeg = finiteOperand(operation.angleDeg ?? operation.rotationDeg ?? operation.angle, 0, 'angleDeg');
        nativeCommand = new RotateEntitiesCommand(nativeIds, center, angleDeg);
        break;
      }
      case 'SCALE': {
        const center = operation.center || { x: 0, y: 0, z: 0 };
        const { sx, sy, sz } = scaleOperands(operation);
        nativeCommand = new ScaleEntitiesCommand(nativeIds, center, { x: sx, y: sy, z: sz });
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

    // Step 3: Every native mutation enters the authoritative A09 history/transaction port.
    if (!this.commandHistory || typeof this.commandHistory.execute !== 'function') {
      throw new SemanticCommandDispatchError(
        'Semantic command dispatch requires the A09 CommandHistory transaction port',
        'MISSING_COMMAND_HISTORY'
      );
    }

    const changeSet = this.commandHistory.execute(nativeCommand, document);
    if (document.sourceRevision != null && typeof document.revision === 'number') {
      document.sourceRevision = document.revision;
    }

    const resultRevision = document.revision ?? document.sourceRevision ?? 0;

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
