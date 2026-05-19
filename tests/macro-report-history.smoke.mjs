import assert from 'node:assert/strict';
import {
  addMacroReportHistoryEntry,
  clearMacroReportHistory,
  createMacroReportHistoryEntry,
  findMacroReportHistoryEntry,
  loadMacroReportHistoryFromStorage,
  macroReportHistoryLabel,
  parseMacroReportHistoryJson,
  saveMacroReportHistoryToStorage,
  serializeMacroReportHistory,
  sortMacroReportHistory,
  trimMacroReportHistory,
} from '../macro/macro-report-history.js';

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

const reportA = {
  contract: 'MACRO_SCRIPT_REPORT_1.0.0',
  sourceName: 'run',
  finishedAt: '2026-01-01T00:00:01.000Z',
  ok: true,
  summary: { ok: true, executedCount: 1 },
};

const reportB = {
  contract: 'MACRO_SCRIPT_LINT_1.0.0',
  sourceName: 'lint',
  generatedAt: '2026-01-02T00:00:00.000Z',
  ok: false,
  summary: { ok: false, errorCount: 1 },
};

assert.equal(
  macroReportHistoryLabel(reportA),
  'MACRO_SCRIPT_REPORT_1.0.0 PASS run @ 2026-01-01T00:00:01.000Z'
);

const entryA = createMacroReportHistoryEntry(reportA, 'Run A', '2026-01-01T00:00:02.000Z');

assert.equal(entryA.label, 'Run A');
assert.equal(entryA.report.contract, 'MACRO_SCRIPT_REPORT_1.0.0');

let result = addMacroReportHistoryEntry([], reportA, {
  label: 'Run A',
  now: '2026-01-01T00:00:02.000Z',
});

assert.equal(result.entries.length, 1);
assert.equal(result.entry.label, 'Run A');

result = addMacroReportHistoryEntry(result.entries, reportB, {
  label: 'Lint B',
  now: '2026-01-02T00:00:00.000Z',
});

assert.equal(result.entries.length, 2);
assert.equal(result.entries[0].label, 'Lint B');

assert.equal(findMacroReportHistoryEntry(result.entries, result.entry.id).label, 'Lint B');

assert.deepEqual(
  sortMacroReportHistory(result.entries).map((entry) => entry.label),
  ['Lint B', 'Run A']
);

assert.equal(trimMacroReportHistory(result.entries, 1).length, 1);
assert.deepEqual(clearMacroReportHistory(), []);

const json = serializeMacroReportHistory(result.entries, {
  exportedAt: '2026-01-03T00:00:00.000Z',
});

const parsed = parseMacroReportHistoryJson(json);

assert.equal(parsed.length, 2);
assert.equal(parsed[0].label, 'Lint B');

assert.throws(
  () => parseMacroReportHistoryJson('{"contract":"BAD","entries":[]}'),
  /Invalid macro report history contract/
);

assert.throws(
  () => createMacroReportHistoryEntry({ contract: 'NO_SUMMARY' }),
  /Invalid macro report/
);

const storage = createMemoryStorage();

saveMacroReportHistoryToStorage(storage, result.entries, 'KEY');

const loaded = loadMacroReportHistoryFromStorage(storage, 'KEY');

assert.equal(loaded.length, 2);

console.log('PASS macro-report-history.smoke.mjs');