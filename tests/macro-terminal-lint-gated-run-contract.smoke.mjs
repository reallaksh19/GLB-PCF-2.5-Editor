import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const policy = fs.readFileSync('macro/macro-script-run-policy.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'createMacroScriptRunBlockedReport',
  'formatMacroScriptRunBlockedSummary',
  'normalizeMacroScriptRunOptions',
  'shouldRunMacroScriptAfterLint',
].forEach((text) => mustContain(policy, text, `policy ${text}`));

[
  'macro-script-lint-before-run',
  'const scriptLintBeforeRun',
  'let lastScriptRunBlockedReport',
  'normalizeMacroScriptRunOptions',
  'shouldRunMacroScriptAfterLint',
  'createMacroScriptRunBlockedReport',
  'SCRIPT_RUN_BLOCKED',
  'lintBeforeRun: Boolean(scriptLintBeforeRun.checked)',
  'getLastScriptRunBlockedReport: () => lastScriptRunBlockedReport',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'test:macro-script-run-policy',
  'test:macro-terminal-lint-gated-run-contract',
  'test:macro-script-run-policy-api-contract',
  'test:slice21',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-lint-gated-run-contract.smoke.mjs');