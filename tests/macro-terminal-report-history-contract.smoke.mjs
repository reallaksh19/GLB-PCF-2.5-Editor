import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const history = fs.readFileSync('macro/macro-report-history.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  './macro-report-history.js',
  'macro-report-history-select',
  'macro-report-history-export',
  'macro-report-history-clear',
  'const reportHistorySelect',
  'let macroReportHistory = loadMacroReportHistoryFromStorage',
  'function refreshMacroReportHistorySelect',
  'function persistMacroReportHistory',
  'function getMacroReportHistory',
  'function addMacroReportToHistory',
  'function clearMacroReportHistory',
  'function exportSelectedMacroReport',
  "addMacroReportToHistory(report, 'Macro lint report')",
  "addMacroReportToHistory(blockedReport, 'Macro blocked-run report')",
  "addMacroReportToHistory(report, 'Macro execution report')",
  'refreshMacroReportHistorySelect();',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'MACRO_REPORT_HISTORY_CONTRACT',
  'DEFAULT_MACRO_REPORT_HISTORY_KEY',
  'createMacroReportHistoryEntry',
  'addMacroReportHistoryEntry',
  'serializeMacroReportHistory',
  'parseMacroReportHistoryJson',
  'loadMacroReportHistoryFromStorage',
  'saveMacroReportHistoryToStorage',
].forEach((text) => mustContain(history, text, `history ${text}`));

[
  'test:macro-report-history',
  'test:macro-terminal-report-history-contract',
  'test:macro-report-history-api-contract',
  'test:slice23',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-report-history-contract.smoke.mjs');