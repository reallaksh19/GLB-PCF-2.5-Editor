import assert from 'node:assert/strict';
import {
  createMacroScriptLibraryEntry,
  importMacroScriptLibraryJson,
  mergeMacroScriptLibraryEntries,
  serializeMacroScriptLibrary,
  validateMacroScriptLibraryImportJson,
} from '../macro/macro-script-library.js';

const existing = [
  createMacroScriptLibraryEntry({
    id: 'route-inspect',
    name: 'Route Inspect',
    script: 'ROUTES',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, [], '2026-01-01T00:00:00.000Z'),
];

const imported = [
  createMacroScriptLibraryEntry({
    id: 'route-inspect',
    name: 'Route Inspect Imported',
    script: 'ROUTES\nROUTE_INFO',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  }, [], '2026-01-02T00:00:00.000Z'),
  createMacroScriptLibraryEntry({
    id: 'break-route',
    name: 'Break Route',
    script: 'BREAK S-1 500,0,0',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  }, [], '2026-01-02T00:00:00.000Z'),
];

let result = mergeMacroScriptLibraryEntries(existing, imported, {
  mode: 'merge',
  now: '2026-01-03T00:00:00.000Z',
});

assert.equal(result.mode, 'merge');
assert.equal(result.importedCount, 2);
assert.equal(result.addedCount, 1);
assert.equal(result.replacedCount, 1);
assert.equal(result.entries.length, 2);

const mergedRouteInspect = result.entries.find((entry) => entry.id === 'route-inspect');

assert.equal(mergedRouteInspect.name, 'Route Inspect Imported');
assert.equal(mergedRouteInspect.script, 'ROUTES\nROUTE_INFO');
assert.equal(mergedRouteInspect.createdAt, '2026-01-01T00:00:00.000Z');
assert.equal(mergedRouteInspect.updatedAt, '2026-01-03T00:00:00.000Z');

result = mergeMacroScriptLibraryEntries(existing, imported, {
  mode: 'replace',
});

assert.equal(result.mode, 'replace');
assert.equal(result.importedCount, 2);
assert.equal(result.replacedCount, 1);
assert.equal(result.entries.length, 2);
assert.equal(result.entries.some((entry) => entry.id === 'break-route'), true);

const json = serializeMacroScriptLibrary(imported, {
  exportedAt: '2026-01-04T00:00:00.000Z',
});

const validation = validateMacroScriptLibraryImportJson(json);

assert.equal(validation.ok, true);
assert.equal(validation.count, 2);

result = importMacroScriptLibraryJson(existing, json, {
  mode: 'merge',
  now: '2026-01-05T00:00:00.000Z',
});

assert.equal(result.importedEntries.length, 2);
assert.equal(result.entries.length, 2);
assert.equal(result.entries.find((entry) => entry.id === 'route-inspect').updatedAt, '2026-01-05T00:00:00.000Z');

assert.throws(
  () => validateMacroScriptLibraryImportJson('{"contract":"BAD","entries":[]}'),
  /Invalid macro script library contract/
);

assert.throws(
  () => importMacroScriptLibraryJson(existing, '{"contract":"MACRO_SCRIPT_LIBRARY_1.0.0"}'),
  /entries must be an array/
);

console.log('PASS macro-script-library-import.smoke.mjs');
