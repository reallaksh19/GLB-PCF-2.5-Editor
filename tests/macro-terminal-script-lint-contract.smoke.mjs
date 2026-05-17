import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const engine = fs.readFileSync('macro/macro-engine.js', 'utf8');
const commands = fs.readFileSync('macro/macro-commands.js', 'utf8');
const lint = fs.readFileSync('macro/macro-script-lint.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'MACRO_SCRIPT_LINT_CONTRACT',
  'tokenizeMacroLintLine',
  'createMacroScriptLintReport',
  'formatMacroScriptLintSummary',
].forEach((text) => mustContain(lint, text, `lint ${text}`));

[
  'listRegisteredCommandNames',
].forEach((text) => mustContain(commands, text, `commands ${text}`));

[
  'lintMacroScript',
  'listMacroCommands',
  'createMacroScriptLintReport',
].forEach((text) => mustContain(engine, text, `engine ${text}`));

[
  'lintMacroScript',
  'formatMacroScriptLintSummary',
  'macro-script-lint',
  'const scriptLint',
  'let lastScriptLintReport',
  'function lintScript(script = getScript(), options = {})',
  'SCRIPT_LINT_RESULT',
  'scriptLint.addEventListener',
  'lintScript,',
  'getLastScriptLintReport: () => lastScriptLintReport',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'test:macro-script-lint',
  'test:macro-script-lint-engine',
  'test:macro-terminal-script-lint-contract',
  'test:slice20',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-script-lint-contract.smoke.mjs');