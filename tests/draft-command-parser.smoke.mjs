import assert from 'node:assert/strict';
import { parseDraftCommandOrThrow } from '../editor/draft-command-parser.js';
import { parseHudLineCommand } from '../hud/hud-line-command-parser.js';
import { executeMacro } from '../macro/macro-engine.js';

function almostEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function assertPoint(point, expected, label) {
  assert.ok(almostEqual(point.x, expected.x), `${label}.x expected ${expected.x}, got ${point.x}`);
  assert.ok(almostEqual(point.y, expected.y), `${label}.y expected ${expected.y}, got ${point.y}`);
  assert.ok(almostEqual(point.z, expected.z), `${label}.z expected ${expected.z}, got ${point.z}`);
}

const from = { x: 0, y: 0, z: 0 };

const cases = [
  { token: 'X1000', expected: { x: 1000, y: 0, z: 0 } },
  { token: 'Y-750', expected: { x: 0, y: -750, z: 0 } },
  { token: 'R500', expected: { x: 0, y: 0, z: 500 } },
  { token: 'D500', expected: { x: 0, y: 0, z: -500 } },
  { token: '@1000,250,0', expected: { x: 1000, y: 250, z: 0 } },
  { token: '1000,2500,0', expected: { x: 1000, y: 2500, z: 0 } },
];

for (const item of cases) {
  const parsed = parseDraftCommandOrThrow(item.token, from, { axisLock: 'X' });
  assertPoint(parsed.toPoint, item.expected, `draft:${item.token}`);

  const hudParsed = parseHudLineCommand(item.token, from, 'X');
  assertPoint(hudParsed.toPoint, item.expected, `hud:${item.token}`);
}

const bearing = parseDraftCommandOrThrow('@1000<90', from, { axisLock: 'X' });
assert.ok(almostEqual(bearing.toPoint.x, 0), `bearing x should be 0, got ${bearing.toPoint.x}`);
assert.ok(almostEqual(bearing.toPoint.y, 1000), `bearing y should be 1000, got ${bearing.toPoint.y}`);
assert.ok(almostEqual(bearing.toPoint.z, 0), `bearing z should be 0, got ${bearing.toPoint.z}`);

const macroContext = {};
executeMacro('ROUTE PIPELINE=L100', macroContext);
executeMacro('START 0,0,0', macroContext);
const macroLine = executeMacro('LINE X1000', macroContext);
assert.ok(Array.isArray(macroLine.comps) && macroLine.comps.length >= 1, 'macro LINE should create at least one component');
const pipe = macroLine.comps.find((comp) => comp.type === 'PIPE');
assert.ok(pipe, 'macro LINE should create a PIPE component');
assertPoint(pipe.geometry.ep2, { x: 1000, y: 0, z: 0 }, 'macro:LINE X1000 ep2');

console.log('Draft command parser smoke passed', {
  testedTokens: cases.length + 1,
  macroComponents: macroLine.comps.length,
});
