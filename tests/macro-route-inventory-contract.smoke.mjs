import assert from 'node:assert/strict';
import fs from 'node:fs';

const commands = fs.readFileSync('macro/macro-commands.js', 'utf8');
const terminal = fs.readFileSync('macro/macro-terminal.js', 'utf8');
const helper = fs.readFileSync('macro/macro-route-inventory.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  './macro-route-inventory.js',
  "register('ROUTES'",
  "register('ROUTE_INFO'",
  "register('ROUTE_DERIVED'",
  'listRouteInventory',
  'getRouteInventoryDetail',
  'listDerivedRouteComponents',
].forEach((text) => mustContain(commands, text, `macro-commands ${text}`));

[
  'parseRouteInventoryArgs',
  'resolveInventoryRouteId',
  'routeToInventorySummary',
  'routeToInventoryDetail',
  'listDerivedRouteComponents',
  'formatRouteInventoryMessage',
].forEach((text) => mustContain(helper, text, `helper ${text}`));

[
  'ROUTES, ROUTE_INFO, ROUTE_DERIVED',
  'Route inspect: ROUTES / ROUTE_INFO ROUTE=<id> / ROUTE_DERIVED ROUTE=<id>',
].forEach((text) => mustContain(terminal, text, `terminal ${text}`));

[
  'test:macro-route-inventory',
  'test:macro-route-inventory-commands',
  'test:macro-route-inventory-contract',
  'test:slice12',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS macro-route-inventory-contract.smoke.mjs');
