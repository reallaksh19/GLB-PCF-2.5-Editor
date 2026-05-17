import assert from 'node:assert/strict';
import {
  createMacroScriptLibraryEntry,
  filterMacroScriptLibrary,
  formatMacroScriptTags,
  normalizeMacroScriptTag,
  normalizeMacroScriptTags,
  parseMacroScriptTags,
  updateMacroScriptLibraryEntryMetadata,
} from '../macro/macro-script-library.js';

assert.equal(normalizeMacroScriptTag(' Route Inspect! '), 'route-inspect');
assert.equal(normalizeMacroScriptTag(''), '');

assert.deepEqual(
  normalizeMacroScriptTags(['Route', 'route', ' Edit ', 'line diagram', '']),
  ['edit', 'line-diagram', 'route']
);

assert.deepEqual(
  parseMacroScriptTags('route, edit; line diagram, route'),
  ['edit', 'line-diagram', 'route']
);

assert.equal(formatMacroScriptTags(['route', 'edit', 'route']), 'edit, route');

let entries = [
  createMacroScriptLibraryEntry({
    id: 'route-inspect',
    name: 'Route Inspect',
    script: 'ROUTES',
    tags: ['route'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, [], '2026-01-01T00:00:00.000Z'),
];

const result = updateMacroScriptLibraryEntryMetadata(entries, 'route-inspect', {
  name: 'Route Inspect Updated',
  tags: 'route, inspect, macro',
}, '2026-01-02T00:00:00.000Z');

entries = result.entries;

assert.equal(result.entry.name, 'Route Inspect Updated');
assert.deepEqual(result.entry.tags, ['inspect', 'macro', 'route']);
assert.equal(result.entry.createdAt, '2026-01-01T00:00:00.000Z');
assert.equal(result.entry.updatedAt, '2026-01-02T00:00:00.000Z');

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'macro').map((entry) => entry.id),
  ['route-inspect']
);

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'inspect').map((entry) => entry.id),
  ['route-inspect']
);

assert.throws(
  () => updateMacroScriptLibraryEntryMetadata(entries, 'NOPE', { name: 'X' }),
  /Macro script not found/
);

console.log('PASS macro-script-library-tags.smoke.mjs');
