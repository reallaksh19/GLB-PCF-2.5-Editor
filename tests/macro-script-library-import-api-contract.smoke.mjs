import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('validateMacroScriptLibraryImportJson(jsonText)'),
  'Import must validate JSON before mutating library'
);

assert.ok(
  terminal.includes('importMacroScriptLibraryJson(scriptLibrary, jsonText, {'),
  'Import must use deterministic library import helper'
);

assert.ok(
  terminal.includes("mode: scriptLibraryImportMode.value || 'merge'"),
  'File import must respect UI merge/replace mode'
);

assert.ok(
  terminal.includes('scriptLibraryFile.click()'),
  'Import button must open hidden file input'
);

assert.ok(
  terminal.includes('persistScriptLibrary();'),
  'Import must persist imported library'
);

assert.ok(
  terminal.includes('importScriptLibraryFromJson,\n    importScriptLibraryFromFile,'),
  'initMacroTerminal must expose import API methods'
);

assert.equal(
  countOf(terminal, 'function importScriptLibraryFromJson'),
  1,
  'importScriptLibraryFromJson should be declared once'
);

assert.equal(
  countOf(terminal, 'async function importScriptLibraryFromFile'),
  1,
  'importScriptLibraryFromFile should be declared once'
);

console.log('PASS macro-script-library-import-api-contract.smoke.mjs');
