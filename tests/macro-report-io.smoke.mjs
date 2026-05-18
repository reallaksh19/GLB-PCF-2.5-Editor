import assert from 'node:assert/strict';
import {
  createMacroReportDownloadPayload,
  isMacroReportLike,
  macroReportFilename,
  macroReportTimestamp,
  normalizeMacroReportPrefix,
  parseMacroReportJson,
  serializeMacroReport,
} from '../macro/macro-report-io.js';

const executionReport = {
  contract: 'MACRO_SCRIPT_REPORT_1.0.0',
  sourceName: 'unit',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
  ok: true,
  summary: {
    ok: true,
    executedCount: 1,
    successCount: 1,
    failureCount: 0,
  },
};

const lintReport = {
  contract: 'MACRO_SCRIPT_LINT_1.0.0',
  sourceName: 'unit-lint',
  generatedAt: '2026-01-02T00:00:00.000Z',
  ok: false,
  summary: {
    ok: false,
    checkedCount: 1,
    errorCount: 1,
    warningCount: 0,
  },
};

assert.equal(normalizeMacroReportPrefix(' macro report:* '), 'macro-report');
assert.equal(isMacroReportLike(executionReport), true);
assert.equal(isMacroReportLike({ contract: 'X' }), false);

assert.equal(macroReportTimestamp(executionReport), '2026-01-01T00:00:01.000Z');
assert.equal(macroReportTimestamp(lintReport), '2026-01-02T00:00:00.000Z');

assert.equal(
  macroReportFilename(executionReport, 'macro-script-run-report'),
  'macro-script-run-report-2026-01-01T00-00-01.000Z.json'
);

const json = serializeMacroReport(executionReport, 2);
const parsed = parseMacroReportJson(json);

assert.equal(parsed.contract, 'MACRO_SCRIPT_REPORT_1.0.0');
assert.equal(parsed.summary.successCount, 1);

assert.throws(
  () => serializeMacroReport({ contract: 'MACRO_SCRIPT_REPORT_1.0.0' }),
  /missing contract or summary/
);

assert.throws(
  () => parseMacroReportJson('{"contract":"BAD","summary":{}}'),
  /Unsupported macro report contract/
);

const payload = createMacroReportDownloadPayload(lintReport, {
  prefix: 'lint',
  space: 0,
});

assert.equal(payload.filename, 'lint-2026-01-02T00-00-00.000Z.json');
assert.equal(payload.mime, 'application/json;charset=utf-8');
assert.equal(payload.contract, 'MACRO_REPORT_IO_1.0.0');
assert.ok(payload.text.includes('"MACRO_SCRIPT_LINT_1.0.0"'));

console.log('PASS macro-report-io.smoke.mjs');