import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const workflowText = readFileSync('.github/workflows/phase-gates.yml', 'utf8');

const PHASE0_SCRIPT_ORDER = Object.freeze([
  'test:no-large-modules',
  'test:no-pcd-shims',
  'test:no-pcd-mutation',
  'test:no-legacy-pcd-db-runtime',
  'test:pcd-public-api',
  'test:pcd',
  'test:pcd-component-studio-contract',
  'test:pcd-canonical-geometry-contract',
  'test:pcd-workbench-model-contract',
  'test:pcd-graph-validation-contract',
  'test:bm1-benchmark',
  'test:bm1-pipe-list',
  'test:bm1-macro-route',
  'test:phase0-parity',
  'test:geometry-view',
]);

const EXPECTED_DIRECT_SCRIPT_COMMANDS = Object.freeze({
  'test:no-large-modules': 'node tests/no-large-modules.smoke.mjs',
  'test:no-pcd-shims': 'node tests/no-pcd-shims.smoke.mjs',
  'test:no-pcd-mutation': 'node tests/no-pcd-mutation.smoke.mjs',
  'test:no-legacy-pcd-db-runtime': 'node tests/no-legacy-pcd-db-runtime.smoke.mjs',
  'test:pcd-public-api': 'node tests/pcd-public-api.smoke.mjs',
  'test:pcd-component-studio-contract': 'node tests/pcd-component-studio-contract.smoke.mjs',
  'test:pcd-canonical-geometry-contract': 'node tests/pcd-canonical-geometry-contract.smoke.mjs',
  'test:pcd-workbench-model-contract': 'node tests/pcd-workbench-model-contract.smoke.mjs',
  'test:pcd-graph-validation-contract': 'node tests/pcd-graph-validation-contract.smoke.mjs',
  'test:bm1-benchmark': 'node tests/bm1-centerline-benchmark.smoke.mjs',
  'test:bm1-pipe-list': 'node tests/bm1-pipe-list-normalization.smoke.mjs',
  'test:bm1-macro-route': 'node tests/bm1-macro-route-bridge.smoke.mjs',
  'test:phase0-parity': 'node tests/phase0-local-ci-parity.smoke.mjs',
  'test:geometry-view': 'node tests/geometry-view.smoke.mjs',
});

const EXPECTED_WORKFLOW_RUNS = Object.freeze(PHASE0_SCRIPT_ORDER.map((script) => `npm run ${script}`));

function workflowRuns() {
  return [...workflowText.matchAll(/^\s*run:\s*(.+)$/gm)].map((match) => match[1].trim());
}

test('phase0 package scripts expose every explicit gate', () => {
  for (const script of PHASE0_SCRIPT_ORDER) {
    assert.ok(packageJson.scripts[script], `missing package script ${script}`);
  }
  for (const [script, command] of Object.entries(EXPECTED_DIRECT_SCRIPT_COMMANDS)) {
    assert.equal(packageJson.scripts[script], command, `${script} command drifted`);
  }
});

test('local npm run test:phase0 keeps the required gate order', () => {
  const expected = PHASE0_SCRIPT_ORDER.map((script) => `npm run ${script}`).join(' && ');
  assert.equal(packageJson.scripts['test:phase0'], expected);
});

test('Phase Gates workflow keeps the same gate order as local test:phase0', () => {
  assert.deepEqual(workflowRuns(), EXPECTED_WORKFLOW_RUNS);
});
