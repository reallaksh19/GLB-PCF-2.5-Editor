import assert from 'node:assert/strict';
import {
  buildDefaultMacroScriptLibrary,
  createMacroScriptLibraryDownloadPayload,
  createMacroScriptLibraryEntry,
  findMacroScriptLibraryEntry,
  loadMacroScriptLibraryFromStorage,
  macroScriptIdFromName,
  normalizeMacroScriptLibraryEntry,
  normalizeMacroScriptName,
  parseMacroScriptLibraryJson,
  removeMacroScriptLibraryEntry,
  saveMacroScriptLibraryToStorage,
  serializeMacroScriptLibrary,
  sortMacroScriptLibrary,
  uniqueMacroScriptId,
  upsertMacroScriptLibraryEntry,
} from '../macro/macro-script-library.js';

function createMemoryStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

assert.equal(normalizeMacroScriptName('  My   Script  '), 'My Script');
assert.equal(normalizeMacroScriptName(''), 'Untitled Macro Script');
assert.equal(macroScriptIdFromName('My Script! 01'), 'my-script-01');

const first = createMacroScriptLibraryEntry({
  name: 'Route Inspect',
  script: 'ROUTES\r\nROUTE_INFO',
}, [], '2026-01-01T00:00:00.000Z');

assert.equal(first.id, 'route-inspect');
assert.equal(first.name, 'Route Inspect');
assert.equal(first.script, 'ROUTES\nROUTE_INFO');
assert.equal(first.createdAt, '2026-01-01T00:00:00.000Z');

assert.equal(uniqueMacroScriptId([first], 'route-inspect'), 'route-inspect-2');

const normalized = normalizeMacroScriptLibraryEntry({
  id: 'X',
  name: '  X Script ',
  script: 'A\rB',
  tags: ['a', 2, ''],
  createdAt: 'C',
});

assert.deepEqual(normalized, {
  id: 'x',
  name: 'X Script',
  script: 'A\nB',
  tags: ['2', 'a'],
  createdAt: 'C',
  updatedAt: 'C',
});

let library = [];
let result = upsertMacroScriptLibraryEntry(library, {
  name: 'Route Inspect',
  script: 'ROUTES',
}, '2026-01-01T00:00:00.000Z');

library = result.entries;

assert.equal(library.length, 1);
assert.equal(result.entry.id, 'route-inspect');

result = upsertMacroScriptLibraryEntry(library, {
  id: 'route-inspect',
  name: 'Route Inspect Updated',
  script: 'ROUTES\nROUTE_INFO',
}, '2026-01-01T00:00:01.000Z');

library = result.entries;

assert.equal(library.length, 1);
assert.equal(result.entry.name, 'Route Inspect Updated');
assert.equal(result.entry.createdAt, '2026-01-01T00:00:00.000Z');
assert.equal(result.entry.updatedAt, '2026-01-01T00:00:01.000Z');

assert.equal(findMacroScriptLibraryEntry(library, 'route-inspect').name, 'Route Inspect Updated');

library = [
  createMacroScriptLibraryEntry({ name: 'B', script: 'B' }, [], 'T'),
  createMacroScriptLibraryEntry({ name: 'A', script: 'A' }, [], 'T'),
];

assert.deepEqual(sortMacroScriptLibrary(library).map((entry) => entry.name), ['A', 'B']);

const removed = removeMacroScriptLibraryEntry(library, 'a');

assert.equal(removed.removed.name, 'A');
assert.deepEqual(removed.entries.map((entry) => entry.name), ['B']);

const json = serializeMacroScriptLibrary(library, {
  exportedAt: '2026-01-01T00:00:00.000Z',
});

const parsed = parseMacroScriptLibraryJson(json);

assert.equal(parsed.length, 2);

assert.throws(
  () => parseMacroScriptLibraryJson('{"contract":"BAD","entries":[]}'),
  /Invalid macro script library contract/
);

assert.throws(
  () => parseMacroScriptLibraryJson('{"contract":"MACRO_SCRIPT_LIBRARY_1.0.0"}'),
  /entries must be an array/
);

const payload = createMacroScriptLibraryDownloadPayload(library, {
  exportedAt: '2026-01-01T00:00:00.000Z',
  space: 0,
});

assert.equal(payload.filename, 'macro-script-library-2026-01-01T00-00-00.000Z.json');
assert.equal(payload.mime, 'application/json;charset=utf-8');

const storage = createMemoryStorage();

saveMacroScriptLibraryToStorage(storage, library, 'KEY');

const loaded = loadMacroScriptLibraryFromStorage(storage, 'KEY');

assert.equal(loaded.length, 2);

const defaults = buildDefaultMacroScriptLibrary('2026-01-01T00:00:00.000Z');

assert.equal(defaults.length, 1);
assert.ok(defaults[0].script.includes('LINE START=0,0,0 X1000'));

console.log('PASS macro-script-library.smoke.mjs');
