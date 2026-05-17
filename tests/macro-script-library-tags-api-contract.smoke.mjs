import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const library = fs.readFileSync('macro/macro-script-library.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('tags: parseMacroScriptTags(scriptLibraryTags.value || existing?.tags || [])'),
  'Save must persist normalized tags'
);

assert.ok(
  terminal.includes('scriptLibraryTags.value = formatMacroScriptTags(entry.tags);'),
  'Load/select must restore formatted tags'
);

assert.ok(
  terminal.includes('updateMacroScriptLibraryEntryMetadata(scriptLibrary, scriptId, {'),
  'Metadata update must use deterministic helper'
);

assert.ok(
  terminal.includes('updateScriptLibraryEntryMetadata,'),
  'Terminal API must expose metadata update method'
);

assert.ok(
  library.includes('tags: normalizeMacroScriptTags(entry.tags || []),'),
  'Library entry normalization must normalize tags'
);

assert.equal(
  countOf(terminal, 'function updateScriptLibraryEntryMetadata'),
  1,
  'updateScriptLibraryEntryMetadata must be declared once'
);

console.log('PASS macro-script-library-tags-api-contract.smoke.mjs');
