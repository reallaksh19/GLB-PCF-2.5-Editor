import assert from 'node:assert/strict';
import {
  createMacroScriptRunBlockedReport,
  formatMacroScriptRunBlockedSummary,
  normalizeMacroScriptRunOptions,
  shouldRunMacroScriptAfterLint,
} from '../macro/macro-script-run-policy.js';

assert.deepEqual(normalizeMacroScriptRunOptions({}), {
  lintBeforeRun: false,
  allowRunWithLintErrors: false,
  stopOnError: true,
  sourceName: 'macro-script-run',
});

assert.deepEqual(normalizeMacroScriptRunOptions({
  lintBeforeRun: true,
  allowRunWithLintErrors: true,
  stopOnError: false,
  sourceName: 'unit',
}), {
  lintBeforeRun: true,
  allowRunWithLintErrors: true,
  stopOnError: false,
  sourceName: 'unit',
});

assert.deepEqual(
  shouldRunMacroScriptAfterLint(null, { lintBeforeRun: false }),
  {
    ok: true,
    reason: 'lint-not-required',
    lintRequired: false,
    lintOk: null,
    blocked: false,
  }
);

assert.deepEqual(
  shouldRunMacroScriptAfterLint(null, { lintBeforeRun: true }),
  {
    ok: false,
    reason: 'missing-lint-report',
    lintRequired: true,
    lintOk: false,
    blocked: true,
  }
);

const passLint = {
  ok: true,
  errorCount: 0,
  warningCount: 0,
};

assert.deepEqual(
  shouldRunMacroScriptAfterLint(passLint, { lintBeforeRun: true }),
  {
    ok: true,
    reason: 'lint-passed',
    lintRequired: true,
    lintOk: true,
    blocked: false,
  }
);

const failLint = {
  ok: false,
  errorCount: 1,
  warningCount: 2,
};

assert.deepEqual(
  shouldRunMacroScriptAfterLint(failLint, { lintBeforeRun: true }),
  {
    ok: false,
    reason: 'lint-failed',
    lintRequired: true,
    lintOk: false,
    blocked: true,
  }
);

assert.deepEqual(
  shouldRunMacroScriptAfterLint(failLint, {
    lintBeforeRun: true,
    allowRunWithLintErrors: true,
  }),
  {
    ok: true,
    reason: 'lint-failed-but-override-enabled',
    lintRequired: true,
    lintOk: false,
    blocked: false,
  }
);

const blocked = createMacroScriptRunBlockedReport('BADCOMMAND', failLint, {
  sourceName: 'unit',
  generatedAt: '2026-01-01T00:00:00.000Z',
  lintBeforeRun: true,
});

assert.equal(blocked.contract, 'MACRO_SCRIPT_RUN_POLICY_1.0.0');
assert.equal(blocked.ok, false);
assert.equal(blocked.blocked, true);
assert.equal(blocked.summary.lintErrorCount, 1);
assert.equal(blocked.summary.lintWarningCount, 2);
assert.equal(
  formatMacroScriptRunBlockedSummary(blocked),
  'MACRO_RUN BLOCKED: lint-failed, lintErrors=1, lintWarnings=2'
);

console.log('PASS macro-script-run-policy.smoke.mjs');