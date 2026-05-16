import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const library = fs.readFileSync('macro/macro-script-library.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'importMacroScriptLibraryJson',
  'validateMacroScriptLibraryImportJson',
  'macro-script-library-import-mode',
  'macro-script-library-import',
  'macro-script-library-file',
  'function readTextFile(file)',
  'function importScriptLibraryFromJson(jsonText = \'\', options = {})',
  'async function importScriptLibraryFromFile(file, options = {})',
  'scriptLibraryImport.addEventListener',
  'scriptLibraryFile.addEventListener',
  'importScriptLibraryFromJson,',
  'importScriptLibraryFromFile,',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'mergeMacroScriptLibraryEntries',
  'importMacroScriptLibraryJson',
  'validateMacroScriptLibraryImportJson',
].forEach((text) => mustContain(library, text, `library ${text}`));

[
  'test:macro-script-library-import',
  'test:macro-terminal-script-library-import-contract',
  'test:macro-script-library-import-api-contract',
  'test:slice17',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-script-library-import-contract.smoke.mjs');
