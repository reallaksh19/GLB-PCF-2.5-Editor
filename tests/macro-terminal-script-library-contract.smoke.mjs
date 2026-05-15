import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const library = fs.readFileSync('macro/macro-script-library.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  './macro-script-library.js',
  'macro-script-library-name',
  'macro-script-library-select',
  'macro-script-library-save',
  'macro-script-library-load',
  'macro-script-library-delete',
  'macro-script-library-export',
  'let scriptLibrary = loadMacroScriptLibraryFromStorage',
  'function refreshScriptLibrarySelect',
  'function persistScriptLibrary',
  'function getScriptLibrary',
  'function saveCurrentScriptToLibrary',
  'function loadScriptFromLibrary',
  'function deleteScriptFromLibrary',
  'function exportScriptLibrary',
  'refreshScriptLibrarySelect();',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'MACRO_SCRIPT_LIBRARY_CONTRACT',
  'DEFAULT_MACRO_SCRIPT_LIBRARY_KEY',
  'normalizeMacroScriptName',
  'createMacroScriptLibraryEntry',
  'upsertMacroScriptLibraryEntry',
  'removeMacroScriptLibraryEntry',
  'serializeMacroScriptLibrary',
  'parseMacroScriptLibraryJson',
  'loadMacroScriptLibraryFromStorage',
  'saveMacroScriptLibraryToStorage',
  'buildDefaultMacroScriptLibrary',
].forEach((text) => mustContain(library, text, `library ${text}`));

[
  'test:macro-script-library',
  'test:macro-terminal-script-library-contract',
  'test:macro-script-library-api-contract',
  'test:slice16',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-script-library-contract.smoke.mjs');
