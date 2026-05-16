import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const library = fs.readFileSync('macro/macro-script-library.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'filterMacroScriptLibrary',
  'formatMacroScriptLibraryOptionLabel',
  'macro-script-library-filter',
  'let scriptLibraryFilterQuery =',
  'function getFilteredScriptLibrary()',
  'function getScriptLibraryFilter()',
  'function setScriptLibraryFilter(query = \'\')',
  'scriptLibraryFilter.addEventListener',
  'getFilteredScriptLibrary,',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'tokenizeMacroScriptLibraryQuery',
  'macroScriptLibraryEntrySearchText',
  'macroScriptLibraryEntryMatchesQuery',
  'filterMacroScriptLibrary',
  'collectMacroScriptLibraryTags',
  'formatMacroScriptLibraryOptionLabel',
].forEach((text) => mustContain(library, text, `library ${text}`));

[
  'test:macro-script-library-filter',
  'test:macro-terminal-script-library-filter-contract',
  'test:macro-script-library-filter-api-contract',
  'test:slice18',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-script-library-filter-contract.smoke.mjs');
