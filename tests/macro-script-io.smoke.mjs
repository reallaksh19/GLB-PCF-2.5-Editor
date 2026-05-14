import assert from 'node:assert/strict';
import {
  buildMacroScriptExample,
  createMacroScriptDownloadPayload,
  macroScriptReportFilename,
  normalizeMacroScriptText,
  parseMacroScriptReportJson,
  serializeMacroScriptReport,
} from '../macro/macro-script-io.js';

const report = {
  contract: 'MACRO_SCRIPT_REPORT_1.0.0',
  sourceName: 'unit',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
  ok: true,
  executedCount: 2,
  successCount: 2,
  failureCount: 0,
  summary: {
    ok: true,
    executedCount: 2,
    successCount: 2,
    failureCount: 0,
  },
};

assert.equal(normalizeMacroScriptText('A\r\nB\rC'), 'A\nB\nC');

const filename = macroScriptReportFilename(report);

assert.equal(filename, 'macro-script-report-2026-01-01T00-00-01.000Z.json');

const json = serializeMacroScriptReport(report, 2);
const parsed = parseMacroScriptReportJson(json);

assert.equal(parsed.contract, 'MACRO_SCRIPT_REPORT_1.0.0');
assert.equal(parsed.summary.successCount, 2);

const payload = createMacroScriptDownloadPayload(report, { prefix: 'report', space: 0 });

assert.equal(payload.filename, 'report-2026-01-01T00-00-01.000Z.json');
assert.equal(payload.mime, 'application/json;charset=utf-8');
assert.ok(payload.text.includes('"contract"'));

const example = buildMacroScriptExample();

assert.ok(example.includes('LINE START=0,0,0 X1000'));
assert.ok(example.includes('ROUTE_INFO'));

assert.throws(
  () => parseMacroScriptReportJson('{"contract":"BAD","summary":{}}'),
  /Invalid macro script report contract/
);

assert.throws(
  () => parseMacroScriptReportJson('{"contract":"MACRO_SCRIPT_REPORT_1.0.0"}'),
  /missing summary/
);

console.log('PASS macro-script-io.smoke.mjs');
