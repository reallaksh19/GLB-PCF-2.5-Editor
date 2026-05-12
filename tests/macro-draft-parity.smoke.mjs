import assert from 'node:assert/strict';
import {
  parseMacroKv,
  parseMacroPointToken,
  parseMacroStartPointToken,
  resolveMacroDraftSequence,
  resolveMacroLine,
} from '../macro/macro-draft-parity.js';

const ctx = {
  workingOrigin: { x: 10, y: 20, z: 30 },
  lastPoint: { x: 100, y: 200, z: 300 },
  pipeline: 'P-100',
};

let parsed = parseMacroKv(['START=0,0,0', 'X1000', 'Y750', 'PIPELINE=P-200']);

assert.deepEqual(parsed.opts, {
  START: '0,0,0',
  PIPELINE: 'P-200',
});
assert.deepEqual(parsed.values, ['X1000', 'Y750']);

assert.deepEqual(parseMacroPointToken('1,2,3', ctx), { x: 11, y: 22, z: 33 });
assert.deepEqual(parseMacroPointToken('@1,2,3', ctx), { x: 101, y: 202, z: 303 });

assert.deepEqual(parseMacroStartPointToken('1,2,3', ctx), { x: 1, y: 2, z: 3 });
assert.deepEqual(parseMacroStartPointToken('@1,2,3', ctx), { x: 101, y: 202, z: 303 });

let line = resolveMacroLine(['START=0,0,0', 'X1000'], ctx);

assert.deepEqual(line.startPoint, { x: 0, y: 0, z: 0 });
assert.deepEqual(line.endPoint, { x: 1000, y: 0, z: 0 });
assert.equal(line.mode, 'axis');

line = resolveMacroLine(['START=0,0,0', '@1000<90'], ctx);

assert.ok(Math.abs(line.endPoint.x - 0) < 1e-6);
assert.equal(Math.round(line.endPoint.y), 1000);
assert.equal(line.mode, 'bearing');

line = resolveMacroLine(['0,0,0', '1000,500,0'], ctx);

assert.deepEqual(line.startPoint, { x: 10, y: 20, z: 30 });
assert.deepEqual(line.endPoint, { x: 1010, y: 520, z: 30 });
assert.equal(line.mode, 'absolute-pair');

const seq = resolveMacroDraftSequence(['START=0,0,0', 'X1000', 'Y750', 'D250'], ctx);

assert.equal(seq.points.length, 4);
assert.deepEqual(seq.points[0], { x: 0, y: 0, z: 0 });
assert.deepEqual(seq.points[1], { x: 1000, y: 0, z: 0 });
assert.deepEqual(seq.points[2], { x: 1000, y: 750, z: 0 });
assert.deepEqual(seq.points[3], { x: 1000, y: 750, z: -250 });

console.log('PASS macro-draft-parity.smoke.mjs');
