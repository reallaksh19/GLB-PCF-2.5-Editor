/**
 * core/commands/cad/cad-command.js
 *
 * Base CadCommand and CompositeCadCommand definitions.
 * Every user action that modifies a CAD document must encapsulate its mutation
 * within a CadCommand instance and return a ChangeSet (Invariant 7).
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { ChangeSet } from './change-set.js';

export class CadCommand {
  /**
   * @param {Object} [params]
   * @param {string} [params.name='CAD_COMMAND']
   * @param {string} [params.description]
   */
  constructor(params = {}) {
    this.name = params.name || 'CAD_COMMAND';
    this.description = params.description || this.name;
    this.executed = false;
  }

  /**
   * Execute mutation on document and return ChangeSet.
   * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} document
   * @returns {ChangeSet}
   */
  execute(document) {
    throw new Error(`execute() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Revert mutation on document and return inverse ChangeSet.
   * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} document
   * @returns {ChangeSet}
   */
  undo(document) {
    throw new Error(`undo() must be implemented by ${this.constructor.name}`);
  }
}

/**
 * Composite macro command grouping multiple commands executed atomically.
 */
export class CompositeCadCommand extends CadCommand {
  /**
   * @param {Array<CadCommand>} [commands=[]]
   * @param {string} [name='MACRO_COMMAND']
   * @param {string} [description]
   */
  constructor(commands = [], name = 'MACRO_COMMAND', description) {
    super({ name, description: description || `Group of ${commands.length} commands` });
    this.commands = Array.isArray(commands) ? commands : [];
  }

  addCommand(command) {
    if (command instanceof CadCommand) {
      this.commands.push(command);
    }
  }

  execute(document) {
    const combined = new ChangeSet(this.name);
    for (const cmd of this.commands) {
      const cs = cmd.execute(document);
      if (cs) combined.merge(cs);
    }
    this.executed = true;
    return combined;
  }

  undo(document) {
    const combined = new ChangeSet(`UNDO_${this.name}`);
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const cmd = this.commands[i];
      const cs = cmd.undo(document);
      if (cs) combined.merge(cs);
    }
    this.executed = false;
    return combined;
  }
}
