import assert from 'node:assert/strict';
import fs from 'node:fs';

const session = fs.readFileSync('macro/macro-route-session.js', 'utf8');
const editResults = fs.readFileSync('macro/macro-route-edit-results.js', 'utf8');
const inventory = fs.readFileSync('macro/macro-route-inventory.js', 'utf8');
const commands = fs.readFileSync('macro/macro-commands.js', 'utf8');
const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  'getMacroActiveRouteId',
  'setMacroActiveRouteId',
  'clearMacroActiveRouteId',
  'useMacroRoute',
  'currentMacroRoute',
  'clearMacroRoute',
].forEach((text) => mustContain(session, text, `session ${text}`));

[
  './macro-route-session.js',
  'getMacroActiveRouteId(ctx)',
  'USE_ROUTE',
].forEach((text) => mustContain(editResults + commands, text, `route session integration ${text}`));

[
  'resolveInventoryRouteId(parsed, routeEngine, ctx)',
  "register('USE_ROUTE'",
  "register('CURRENT_ROUTE'",
  "register('CLEAR_ROUTE'",
].forEach((text) => mustContain(commands, text, `commands ${text}`));

[
  'getMacroActiveRouteId(ctx)',
].forEach((text) => mustContain(inventory, text, `inventory ${text}`));

[
  'USE_ROUTE, CURRENT_ROUTE, CLEAR_ROUTE',
  'Route session: USE_ROUTE <id> / CURRENT_ROUTE / CLEAR_ROUTE',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'test:macro-route-session',
  'test:macro-route-session-commands',
  'test:macro-route-session-contract',
  'test:slice13',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-route-session-contract.smoke.mjs');
