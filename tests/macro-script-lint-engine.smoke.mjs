import assert from 'node:assert/strict';
import {
  lintMacroScript,
  listMacroCommands,
} from '../macro/macro-engine.js';

const commands = listMacroCommands();

assert.ok(commands.includes('LINE'), 'LINE must be registered');
assert.ok(commands.includes('ROUTES'), 'ROUTES must be registered');
assert.ok(commands.includes('USE_ROUTE'), 'USE_ROUTE must be registered');

let report = lintMacroScript(`
LINE START=0,0,0 X1000
ROUTES
USE_ROUTE R-1
`, {
  generatedAt: '2026-01-01T00:00:00.000Z',
});

assert.equal(report.ok, true);
assert.equal(report.errorCount, 0);
assert.equal(report.checkedCount, 3);

report = lintMacroScript(`
LINE START=0,0,0 X1000
BADCOMMAND
ROUTES
`, {
  generatedAt: '2026-01-01T00:00:00.000Z',
});

assert.equal(report.ok, false);
assert.equal(report.errorCount, 1);
assert.equal(report.issues[0].commandName, 'BADCOMMAND');
assert.match(report.issues[0].message, /Unknown macro command/);

report = lintMacroScript('BADCOMMAND', {
  enforceKnownCommands: false,
});

assert.equal(report.ok, true);
assert.equal(report.errorCount, 0);

console.log('PASS macro-script-lint-engine.smoke.mjs');