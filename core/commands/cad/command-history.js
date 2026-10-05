/**
 * core/commands/cad/command-history.js
 *
 * Command History & Transaction Manager.
 * Orchestrates undo/redo stacks, atomic batch grouping, and change notifications.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { CadCommand, CompositeCadCommand } from './cad-command.js';
import { ChangeSet } from './change-set.js';

export class CommandHistory {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxHistory=100]
   */
  constructor(options = {}) {
    this.maxHistory = Math.max(1, options.maxHistory || 100);
    this.undoStack = [];
    this.redoStack = [];
    this._listeners = new Set();
    this._batch = null; // { name, commands: [] }
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get undoCount() {
    return this.undoStack.length;
  }

  get redoCount() {
    return this.redoStack.length;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._batch = null;
    this._notify('clear', null, new ChangeSet('CLEAR_HISTORY'));
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(action, command, changeSet) {
    const event = {
      action, // 'execute' | 'undo' | 'redo' | 'batch_end' | 'clear'
      command,
      changeSet,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoCount: this.undoCount,
      redoCount: this.redoCount,
      timestamp: Date.now(),
    };

    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('CommandHistory listener error:', err);
      }
    }
  }

  /**
   * Begin an atomic macro batch.
   * Commands executed while a batch is active will be grouped into a single
   * CompositeCadCommand upon endBatch().
   *
   * @param {string} [name='BATCH_TRANSACTION']
   */
  beginBatch(name = 'BATCH_TRANSACTION') {
    if (this._batch) {
      throw new Error(`Cannot begin batch "${name}": a batch "${this._batch.name}" is already open.`);
    }
    this._batch = {
      name,
      commands: [],
      changeSet: new ChangeSet(name),
    };
  }

  /**
   * End an active batch and commit it as a single composite command to the undo stack.
   *
   * @returns {ChangeSet|null}
   */
  endBatch() {
    if (!this._batch) return null;
    const batch = this._batch;
    this._batch = null;

    if (batch.commands.length === 0) {
      return null;
    }

    const macro = new CompositeCadCommand(batch.commands, batch.name);
    macro.executed = true;

    this.undoStack.push(macro);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];

    this._notify('batch_end', macro, batch.changeSet);
    return batch.changeSet;
  }

  /**
   * Cancel an open batch without committing.
   */
  cancelBatch(document) {
    if (!this._batch) return;
    const batch = this._batch;
    this._batch = null;

    // Rollback any executed commands in the batch
    for (let i = batch.commands.length - 1; i >= 0; i--) {
      batch.commands[i].undo(document);
    }
  }

  /**
   * Execute a command on a CAD document.
   *
   * @param {CadCommand} command
   * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} document
   * @returns {ChangeSet}
   */
  execute(command, document) {
    if (!(command instanceof CadCommand)) {
      throw new Error('Argument to execute() must be an instance of CadCommand');
    }
    if (!document) {
      throw new Error('Document is required for command execution');
    }

    const changeSet = command.execute(document);

    if (this._batch) {
      this._batch.commands.push(command);
      this._batch.changeSet.merge(changeSet);
      return changeSet;
    }

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // New execution clears redo stack
    this.redoStack = [];

    this._notify('execute', command, changeSet);
    return changeSet;
  }

  /**
   * Undo the most recent command on the document.
   *
   * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} document
   * @returns {ChangeSet|null}
   */
  undo(document) {
    if (!this.canUndo || !document) return null;

    const command = this.undoStack.pop();
    const changeSet = command.undo(document);

    this.redoStack.push(command);

    this._notify('undo', command, changeSet);
    return changeSet;
  }

  /**
   * Redo the most recently undone command on the document.
   *
   * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} document
   * @returns {ChangeSet|null}
   */
  redo(document) {
    if (!this.canRedo || !document) return null;

    const command = this.redoStack.pop();
    const changeSet = command.execute(document);

    this.undoStack.push(command);

    this._notify('redo', command, changeSet);
    return changeSet;
  }

  /**
   * Return metadata descriptions of commands currently on undo stack.
   * @returns {Array<{ name: string, description: string }>}
   */
  getUndoList() {
    return this.undoStack.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
    }));
  }

  /**
   * Return metadata descriptions of commands currently on redo stack.
   * @returns {Array<{ name: string, description: string }>}
   */
  getRedoList() {
    return this.redoStack.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
    }));
  }
}
