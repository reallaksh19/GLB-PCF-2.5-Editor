import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const reportIo = fs.readFileSync('macro/macro-report-io.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  './macro-report-io.js',
  'createMacroReportDownloadPayload',
  'macro-script-export-lint',
  'macro-script-export-blocked',
  'const scriptExportLint',
  'const scriptExportBlocked',
  'function exportMacroReport(report = null, prefix = \'macro-report\')',
  'function exportLastLintReport()',
  'function exportLastRunBlockedReport()',
  'scriptExportLint.addEventListener',
  'scriptExportBlocked.addEventListener',
  'exportMacroReport,',
  'exportLastLintReport,',
  'exportLastRunBlockedReport,',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'MACRO_REPORT_IO_CONTRACT',
  'KNOWN_MACRO_REPORT_CONTRACTS',
  'macroReportFilename',
  'serializeMacroReport',
  'parseMacroReportJson',
  'createMacroReportDownloadPayload',
].forEach((text) => mustContain(reportIo, text, `report-io ${text}`));

[
  'test:macro-report-io',
  'test:macro-terminal-report-export-contract',
  'test:macro-report-export-api-contract',
  'test:slice22',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-report-export-contract.smoke.mjs');