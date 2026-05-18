import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('if (normalizedOptions.lintBeforeRun)'),
  'runScript must support lintBeforeRun preflight'
);

assert.ok(
  terminal.includes('lintReport = lintScript(script, {'),
  'runScript must call lintScript before execution'
);

assert.ok(
  terminal.includes('const runDecision = shouldRunMacroScriptAfterLint(lintReport, normalizedOptions);'),
  'runScript must use deterministic run policy decision'
);

assert.ok(
  terminal.includes('return blockedReport;'),
  'runScript must return blocked report when lint gate blocks execution'
);

assert.ok(
  terminal.includes('lastScriptRunBlockedReport = null;'),
  'successful run must clear previous blocked report'
);

assert.ok(
  terminal.includes('lintBeforeRun: normalizedOptions.lintBeforeRun,'),
  'SCRIPT_RESULT trace must include lintBeforeRun metadata'
);

assert.equal(
  countOf(terminal, 'function runScript(script, options = {})'),
  1,
  'runScript must be declared once'
);

console.log('PASS macro-script-run-policy-api-contract.smoke.mjs');