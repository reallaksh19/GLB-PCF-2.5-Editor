import assert from 'node:assert/strict';
import fs from 'node:fs';

const commands = fs.readFileSync('macro/macro-commands.js', 'utf8');
const helper = fs.readFileSync('macro/macro-route-edit-results.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  './macro-route-edit-results.js',
  'parseMacroRouteKv',
  'parseRouteDeltaToken',
  'routeEditResult',
  'routeIdFromOptsOrActive',
  "register('MOVE'",
  "register('STRETCH'",
  "register('ROTATE'",
  "register('BREAK'",
  "register('DELETE'",
].forEach((text) => mustContain(commands, text, `macro-commands ${text}`));

[
  'routeEditResult',
  'routeSnapshot',
  'findRouteTargetKind',
  'routeIdFromOptsOrActive',
].forEach((text) => mustContain(helper, text, `helper ${text}`));

[
  'test:macro-route-edit-results',
  'test:macro-route-edit-commands',
  'test:macro-route-edit-contract',
  'test:slice11',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-route-edit-contract.smoke.mjs');
