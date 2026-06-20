import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PCD_ENTRY = join(ROOT, 'vendor/pipe-component-data/src/index.js');

const REQUIRED_FUNCTIONS = [
  'lookupComponentExact',
  'fromCeg',
  'toCeg',
  'toCanonicalGeometry',
  'toSolid3dSpecs',
  'assertNoInvalidSpecNumbers',
  'toSemanticDxf',
  'fromSemanticDxf',
  'createComponentStudioModel',
];

const REQUIRED_VALUES = [
  'LOOKUP_STATUS',
  'COMPONENT_STUDIO_SCHEMA',
];

test('vendored PipeComponentData exposes required public contract', async () => {
  const pcd = await import(PCD_ENTRY);
  const missingFunctions = REQUIRED_FUNCTIONS.filter((name) => typeof pcd[name] !== 'function');
  const missingValues = REQUIRED_VALUES.filter((name) => !(name in pcd));

  assert.deepEqual(
    missingFunctions,
    [],
    `Missing public function exports: ${missingFunctions.join(', ')}`,
  );
  assert.deepEqual(
    missingValues,
    [],
    `Missing public value exports: ${missingValues.join(', ')}`,
  );
});

test('lookup status contract is explicit', async () => {
  const { LOOKUP_STATUS } = await import(PCD_ENTRY);
  assert.equal(LOOKUP_STATUS.FOUND, 'FOUND');
  assert.equal(LOOKUP_STATUS.NO_EXACT_MATCH, 'NO_EXACT_MATCH');
  assert.equal(LOOKUP_STATUS.CATALOG_ROW_MISSING, 'CATALOG_ROW_MISSING');
  assert.equal(LOOKUP_STATUS.INVALID_ASSETS, 'INVALID_ASSETS');
});
