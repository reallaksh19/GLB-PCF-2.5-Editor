import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('getFilteredScriptLibrary,\n    refreshScriptLibrarySelect,'),
  'initMacroTerminal must expose filtered library API'
);

assert.ok(
  terminal.includes('return filterMacroScriptLibrary(scriptLibrary, scriptLibraryFilterQuery);'),
  'getFilteredScriptLibrary must use deterministic helper'
);

assert.ok(
  terminal.includes('scriptLibraryFilterQuery = String(query || \'\').trim();'),
  'setScriptLibraryFilter must normalize query string'
);

assert.ok(
  terminal.includes('option.textContent = formatMacroScriptLibraryOptionLabel(entry);'),
  'select option labels must use deterministic formatter'
);

assert.ok(
  terminal.includes('scriptLibraryFilter.addEventListener(\'input\''),
  'filter input must update dropdown live'
);

assert.equal(
  countOf(terminal, 'function setScriptLibraryFilter'),
  1,
  'setScriptLibraryFilter should be declared once'
);

assert.equal(
  countOf(terminal, 'function getFilteredScriptLibrary'),
  1,
  'getFilteredScriptLibrary should be declared once'
);

console.log('PASS macro-script-library-filter-api-contract.smoke.mjs');
