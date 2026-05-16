import assert from 'node:assert/strict';
import {
  collectMacroScriptLibraryTags,
  createMacroScriptLibraryEntry,
  filterMacroScriptLibrary,
  formatMacroScriptLibraryOptionLabel,
  macroScriptLibraryEntryMatchesQuery,
  macroScriptLibraryEntrySearchText,
  tokenizeMacroScriptLibraryQuery,
} from '../macro/macro-script-library.js';

const entries = [
  createMacroScriptLibraryEntry({
    id: 'route-inspect',
    name: 'Route Inspect',
    script: 'ROUTES\nROUTE_INFO\nROUTE_DERIVED',
    tags: ['route', 'inspect'],
  }, [], '2026-01-01T00:00:00.000Z'),
  createMacroScriptLibraryEntry({
    id: 'break-route',
    name: 'Break Route',
    script: 'BREAK S-1 500,0,0',
    tags: ['route', 'edit'],
  }, [], '2026-01-01T00:00:00.000Z'),
  createMacroScriptLibraryEntry({
    id: 'valve-template',
    name: 'Valve Template',
    script: 'VALVE 0,0,0 500,0,0',
    tags: ['component'],
  }, [], '2026-01-01T00:00:00.000Z'),
];

assert.deepEqual(tokenizeMacroScriptLibraryQuery('  route   inspect  '), ['route', 'inspect']);
assert.deepEqual(tokenizeMacroScriptLibraryQuery(''), []);

const searchText = macroScriptLibraryEntrySearchText(entries[0]);

assert.ok(searchText.includes('route-inspect'));
assert.ok(searchText.includes('route_info'));
assert.ok(searchText.includes('inspect'));

assert.equal(macroScriptLibraryEntryMatchesQuery(entries[0], 'route inspect'), true);
assert.equal(macroScriptLibraryEntryMatchesQuery(entries[0], 'route badtoken'), false);

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'route').map((entry) => entry.id),
  ['break-route', 'route-inspect']
);

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'break').map((entry) => entry.id),
  ['break-route']
);

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'VALVE').map((entry) => entry.id),
  ['valve-template']
);

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'component').map((entry) => entry.id),
  ['valve-template']
);

assert.deepEqual(
  filterMacroScriptLibrary(entries, 'no-match').map((entry) => entry.id),
  []
);

assert.deepEqual(collectMacroScriptLibraryTags(entries), ['component', 'edit', 'inspect', 'route']);

assert.equal(formatMacroScriptLibraryOptionLabel(entries[0]), 'Route Inspect [inspect, route]');
assert.equal(formatMacroScriptLibraryOptionLabel({ name: 'No Tags', script: '' }), 'No Tags');

console.log('PASS macro-script-library-filter.smoke.mjs');
