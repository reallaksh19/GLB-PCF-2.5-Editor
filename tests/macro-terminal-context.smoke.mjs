import assert from 'node:assert/strict';
import fs from 'node:fs';

const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const commands = fs.readFileSync('macro/macro-commands.js', 'utf8');
const viewerTab = fs.readFileSync('js/tabs/viewer-tab.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'getRouteEngine = null',
  'getRouteEngine,',
  'LINE, POLYLINE, SPLINE/SPLINE_GUIDE',
  'Draft tokens: START=x,y,z X1000 Y-750 R500 D250 @dx,dy,dz @length<angle',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  './macro-draft-parity.js',
  "register('LINE'",
  "register('SPLINE'",
  'resolveMacroLine',
  'resolveMacroDraftSequence',
  'routeEngineOrThrow',
  'macro-line',
  'macro-polyline',
  'macro-spline-guide',
].forEach((text) => mustContain(commands, text, `commands ${text}`));

mustContain(viewerTab, 'initMacroTerminal({', 'viewer-tab macro init');
mustContain(viewerTab, 'getRouteEngine,', 'viewer-tab passes getRouteEngine into macro terminal');

[
  'test:macro-draft-parity',
  'test:macro-line-polyline-spline',
  'test:macro-terminal-context',
  'test:slice9',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-terminal-context.smoke.mjs');
