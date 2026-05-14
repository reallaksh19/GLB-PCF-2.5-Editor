import assert from 'node:assert/strict';
import {
  appendMacroScriptResult,
  createMacroScriptReport,
  finalizeMacroScriptReport,
  formatMacroScriptSummary,
  normalizeMacroScriptError,
  splitMacroScript,
  stripMacroComments,
} from '../macro/macro-script-report.js';

assert.equal(stripMacroComments('LINE X1000 ; comment'), 'LINE X1000 ');
assert.equal(stripMacroComments('LABEL "A;B" ; comment'), 'LABEL "A;B" ');

const lines = splitMacroScript(`
; comment only
LINE START=0,0,0 X1000
LABEL "A;B" ; inline comment

ROUTES
`);

assert.equal(lines.length, 3);
assert.equal(lines[0].line, 3);
assert.equal(lines[0].command, 'LINE START=0,0,0 X1000');
assert.equal(lines[1].command, 'LABEL "A;B"');
assert.equal(lines[2].command, 'ROUTES');

const report = createMacroScriptReport({
  sourceName: 'unit-test',
  startedAt: '2026-01-01T00:00:00.000Z',
  stopOnError: false,
});

appendMacroScriptResult(report, {
  ok: true,
  line: 1,
  command: 'ROUTES',
  result: { message: 'ok' },
});

appendMacroScriptResult(report, {
  ok: false,
  line: 2,
  command: 'BAD',
  error: normalizeMacroScriptError(new Error('bad command')),
});

finalizeMacroScriptReport(report, {
  linesTotal: 2,
  finishedAt: '2026-01-01T00:00:01.000Z',
});

assert.equal(report.ok, false);
assert.equal(report.executedCount, 2);
assert.equal(report.successCount, 1);
assert.equal(report.failureCount, 1);
assert.equal(report.summary.stoppedOnError, false);
assert.equal(formatMacroScriptSummary(report), 'MACRO_SCRIPT FAIL: executed=2, success=1, failed=1');

console.log('PASS macro-script-report.smoke.mjs');
