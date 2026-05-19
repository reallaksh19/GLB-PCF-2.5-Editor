import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('getMacroReportHistory,\n    addMacroReportToHistory,\n    clearMacroReportHistory,\n    refreshMacroReportHistorySelect,\n    exportSelectedMacroReport,'),
  'initMacroTerminal must expose macro report history APIs'
);

assert.ok(
  terminal.includes('saveMacroReportHistoryToStorage(macroReportHistoryStorage, macroReportHistory)'),
  'Report history persistence must write through storage helper'
);

assert.ok(
  terminal.includes("return exportMacroReport(entry.report, 'macro-report-history');"),
  'Selected report export must use generic report export helper'
);

assert.ok(
  terminal.includes('reportHistoryExport.addEventListener'),
  'Report history export button must be wired'
);

assert.ok(
  terminal.includes('reportHistoryClear.addEventListener'),
  'Report history clear button must be wired'
);

assert.equal(
  countOf(terminal, 'function addMacroReportToHistory'),
  1,
  'addMacroReportToHistory must be declared once'
);

assert.equal(
  countOf(terminal, 'function refreshMacroReportHistorySelect'),
  1,
  'refreshMacroReportHistorySelect must be declared once'
);

console.log('PASS macro-report-history-api-contract.smoke.mjs');