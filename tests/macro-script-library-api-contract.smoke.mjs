import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('getScriptLibrary,\n    saveCurrentScriptToLibrary,\n    loadScriptFromLibrary,\n    deleteScriptFromLibrary,\n    exportScriptLibrary,\n    refreshScriptLibrarySelect,'),
  'initMacroTerminal must expose script library API methods'
);

assert.ok(
  terminal.includes('scriptLibrarySave.addEventListener'),
  'Save button must be wired'
);

assert.ok(
  terminal.includes('scriptLibraryLoad.addEventListener'),
  'Load button must be wired'
);

assert.ok(
  terminal.includes('scriptLibraryDelete.addEventListener'),
  'Delete button must be wired'
);

assert.ok(
  terminal.includes('scriptLibraryExport.addEventListener'),
  'Export library button must be wired'
);

assert.ok(
  terminal.includes('createMacroScriptLibraryDownloadPayload(scriptLibrary)'),
  'Export library must use deterministic download payload helper'
);

assert.ok(
  terminal.includes('saveMacroScriptLibraryToStorage(macroScriptStorage, scriptLibrary)'),
  'Library persistence must write to storage helper'
);

assert.equal(
  countOf(terminal, 'function saveCurrentScriptToLibrary'),
  1,
  'saveCurrentScriptToLibrary should be declared once'
);

assert.equal(
  countOf(terminal, 'function loadScriptFromLibrary'),
  1,
  'loadScriptFromLibrary should be declared once'
);

console.log('PASS macro-script-library-api-contract.smoke.mjs');
