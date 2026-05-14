import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');

function countOf(source, text) {
  return source.split(text).length - 1;
}

assert.ok(
  terminal.includes('return {\n    host,\n    ctx,\n    runScript,\n    setScript,\n    getScript,\n    toggleScriptPanel,\n    exportLastReport,'),
  'initMacroTerminal must expose script panel API'
);

assert.ok(
  terminal.includes("runScript(getScript(), {\n      stopOnError: Boolean(scriptStopOnError.checked),"),
  'Run button must execute textarea script with checkbox stopOnError'
);

assert.ok(
  terminal.includes('createMacroScriptDownloadPayload(lastScriptReport)'),
  'Export must serialize last script report through IO helper'
);

assert.ok(
  terminal.includes('setScript(buildMacroScriptExample())'),
  'Example button must populate deterministic example script'
);

assert.equal(
  countOf(terminal, 'lastScriptReport = report'),
  1,
  'runScript should update lastScriptReport exactly once'
);

console.log('PASS macro-script-panel-api-contract.smoke.mjs');
