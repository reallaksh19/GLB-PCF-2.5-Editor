import assert from 'node:assert/strict';
import {
  createMacroScriptLintReport,
  formatMacroScriptLintSummary,
  lintMacroScriptEntries,
  normalizeKnownMacroCommands,
  normalizeMacroCommandName,
  tokenizeMacroLintLine,
} from '../macro/macro-script-lint.js';

assert.deepEqual(tokenizeMacroLintLine('LABEL "A B" TYPE=NOTE'), ['LABEL', 'A B', 'TYPE=NOTE']);
assert.equal(normalizeMacroCommandName(' line '), 'LINE');

const known = normalizeKnownMacroCommands(['line', 'ROUTES', 'USE_ROUTE']);

assert.equal(known.has('LINE'), true);
assert.equal(known.has('ROUTES'), true);

const entries = [
  { line: 1, lineNo: 1, raw: 'LINE START=0,0,0 X1000', command: 'LINE START=0,0,0 X1000' },
  { line: 2, lineNo: 2, raw: 'BADCOMMAND', command: 'BADCOMMAND' },
];

const linted = lintMacroScriptEntries(entries, {
  knownCommands: ['LINE', 'ROUTES'],
});

assert.equal(linted.results.length, 2);
assert.equal(linted.results[0].ok, true);
assert.equal(linted.results[1].ok, false);
assert.equal(linted.issues.length, 1);
assert.match(linted.issues[0].message, /Unknown macro command/);

const report = createMacroScriptLintReport(`
; comment
LINE START=0,0,0 X1000
BADCOMMAND
ROUTES
`, {
  knownCommands: ['LINE', 'ROUTES'],
  generatedAt: '2026-01-01T00:00:00.000Z',
});

assert.equal(report.contract, 'MACRO_SCRIPT_LINT_1.0.0');
assert.equal(report.ok, false);
assert.equal(report.linesTotal, 3);
assert.equal(report.checkedCount, 3);
assert.equal(report.errorCount, 1);
assert.equal(report.knownCommandCount, 2);
assert.equal(report.issues[0].line, 4);
assert.equal(formatMacroScriptLintSummary(report), 'MACRO_LINT FAIL: checked=3, errors=1, warnings=0');

const passReport = createMacroScriptLintReport('LINE START=0,0,0 X1000\nROUTES', {
  knownCommands: ['LINE', 'ROUTES'],
});

assert.equal(passReport.ok, true);
assert.equal(formatMacroScriptLintSummary(passReport), 'MACRO_LINT PASS: checked=2, errors=0, warnings=0');

console.log('PASS macro-script-lint.smoke.mjs');
