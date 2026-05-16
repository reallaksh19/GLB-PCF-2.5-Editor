import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const library = fs.readFileSync('macro/macro-script-library.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'formatMacroScriptTags',
  'parseMacroScriptTags',
  'updateMacroScriptLibraryEntryMetadata',
  'macro-script-library-tags',
  'macro-script-library-update-meta',
  'const scriptLibraryTags',
  'const scriptLibraryUpdateMeta',
  'function updateScriptLibraryEntryMetadata',
  'scriptLibraryUpdateMeta.addEventListener',
  'scriptLibraryTags.value = formatMacroScriptTags',
  'updateScriptLibraryEntryMetadata,',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'normalizeMacroScriptTag',
  'normalizeMacroScriptTags',
  'parseMacroScriptTags',
  'formatMacroScriptTags',
  'updateMacroScriptLibraryEntryMetadata',
].forEach((text) => mustContain(library, text, `library ${text}`));

[
  'test:macro-script-library-tags',
  'test:macro-terminal-script-library-tags-contract',
  'test:macro-script-library-tags-api-contract',
  'test:slice19',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-script-library-tags-contract.smoke.mjs');
