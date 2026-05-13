import assert from 'node:assert/strict';
import fs from 'node:fs';

const forbiddenFiles = [
  'patch_macro.py',
  'patch.py',
  'tmp_patch.py',
  'temp_patch.py',
];

for (const file of forbiddenFiles) {
  assert.equal(fs.existsSync(file), false, `Temporary patch artifact must not exist: ${file}`);
}

const commands = fs.readFileSync('macro/macro-commands.js', 'utf8');

assert.ok(
  commands.includes("register('LINE'"),
  'macro/macro-commands.js must register LINE'
);

assert.ok(
  commands.includes('routeSegmentRefs'),
  'macro/macro-commands.js must keep route result refs separate from component geometry'
);

assert.ok(
  !commands.includes('return registerCompsResult(createdComps, ctx, `POLYLINE created route'),
  'POLYLINE route-engine result must not use registerCompsResult'
);

console.log('PASS no-temp-patch-artifacts.smoke.mjs');