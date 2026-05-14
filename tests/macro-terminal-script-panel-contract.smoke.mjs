import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const io = fs.readFileSync('macro/macro-script-io.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  './macro-script-io.js',
  'macro-script-toggle',
  'macro-run-script',
  'macro-script-panel',
  'macro-script-textarea',
  'macro-script-stop-on-error',
  'macro-script-example',
  'macro-script-clear',
  'macro-script-export',
  'function setScript(script = \'\')',
  'function getScript()',
  'function toggleScriptPanel(force = null)',
  'function exportLastReport()',
  'lastScriptReport = report',
  'getLastScriptReport: () => lastScriptReport',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'MACRO_SCRIPT_IO_CONTRACT',
  'normalizeMacroScriptText',
  'macroScriptReportFilename',
  'serializeMacroScriptReport',
  'parseMacroScriptReportJson',
  'createMacroScriptDownloadPayload',
  'buildMacroScriptExample',
].forEach((text) => mustContain(io, text, `io ${text}`));

[
  'test:macro-script-io',
  'test:macro-terminal-script-panel-contract',
  'test:macro-script-panel-api-contract',
  'test:slice15',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-script-panel-contract.smoke.mjs');
