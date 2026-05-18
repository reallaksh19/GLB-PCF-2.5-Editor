import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes("return exportMacroReport(lastScriptLintReport, 'macro-script-lint-report');"),
  'Lint export must use generic macro report export helper'
);

assert.ok(
  terminal.includes("return exportMacroReport(lastScriptRunBlockedReport, 'macro-script-run-blocked-report');"),
  'Blocked-run export must use generic macro report export helper'
);

assert.ok(
  terminal.includes('createMacroReportDownloadPayload(report, {'),
  'Generic report export must create deterministic download payload'
);

assert.ok(
  terminal.includes('downloadText(payload.filename, payload.text, payload.mime);'),
  'Generic report export must preserve JSON MIME type'
);

assert.ok(
  terminal.includes('exportMacroReport,\n    exportLastLintReport,\n    exportLastRunBlockedReport,'),
  'initMacroTerminal must expose report export APIs'
);

assert.equal(
  countOf(terminal, 'function exportMacroReport'),
  1,
  'exportMacroReport must be declared once'
);

assert.equal(
  countOf(terminal, 'function exportLastLintReport'),
  1,
  'exportLastLintReport must be declared once'
);

assert.equal(
  countOf(terminal, 'function exportLastRunBlockedReport'),
  1,
  'exportLastRunBlockedReport must be declared once'
);

console.log('PASS macro-report-export-api-contract.smoke.mjs');