import assert from 'node:assert/strict';
import fs from 'node:fs';

const report = fs.readFileSync('macro/macro-script-report.js', 'utf8');
const engine = fs.readFileSync('macro/macro-engine.js', 'utf8');
const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'MACRO_SCRIPT_REPORT_CONTRACT',
  'splitMacroScript',
  'createMacroScriptReport',
  'appendMacroScriptResult',
  'finalizeMacroScriptReport',
  'formatMacroScriptSummary',
].forEach((text) => mustContain(report, text, `report ${text}`));

[
  './macro-script-report.js',
  'executeMacroScriptReport',
  'executeMacroScript(script, context)',
  'throwOnError',
].forEach((text) => mustContain(engine, text, `engine ${text}`));

[
  'executeMacroScriptReport',
  'formatMacroScriptSummary',
  'function runScript(script, options = {})',
  'SCRIPT_RESULT',
  'return { host, ctx, runScript }',
  'Script runner: terminal.runScript(script, { stopOnError:true|false })',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'test:macro-script-report',
  'test:macro-script-execution',
  'test:macro-script-contract',
  'test:slice14',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-script-contract.smoke.mjs');
