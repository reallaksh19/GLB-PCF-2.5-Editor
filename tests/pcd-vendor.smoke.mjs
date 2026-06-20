import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDOR_DIR = join(dirname(fileURLToPath(import.meta.url)), '../vendor/pipe-component-data');
const manifest = JSON.parse(readFileSync(join(VENDOR_DIR, 'VENDOR-MANIFEST.json'), 'utf8'));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('vendored pipe-component-data matches manifest hashes (drift guard)', () => {
  const seen = {};
  const hashTree = createHash('sha256');
  for (const p of walk(join(VENDOR_DIR, 'src'))) {
    const rel = relative(VENDOR_DIR, p).replaceAll('\\', '/');
    const bytes = readFileSync(p);
    const hash = createHash('sha256').update(bytes).digest('hex');
    seen[rel] = hash;
    hashTree.update(rel).update('\0').update(hash);
  }
  assert.deepEqual(seen, manifest.fileHashes, 'vendored file set or contents drifted from manifest');
  if (manifest.hashTreeSha256) {
    assert.equal(hashTree.digest('hex'), manifest.hashTreeSha256, 'hashTreeSha256 drifted');
  }
});

test('fromUxmlXml plain-attribute patch is present', () => {
  const text = readFileSync(join(VENDOR_DIR, 'src/parse/fromUxmlXml.js'), 'utf8');
  assert.ok(text.includes('readPlainAttributes'));
});

test('vendored package exports the sentinel API surface', async () => {
  const pcd = await import(join(VENDOR_DIR, 'src/index.js'));
  for (const name of [
    'createPipeDataDb',
    'enrichWithPipeData',
    'toCeg',
    'fromCeg',
    'toUxmlXml',
    'fromUxmlXml',
    'namespaceImportedIds',
    'toSemanticDxf',
    'lookupComponentExact',
    'LOOKUP_STATUS',
  ]) {
    assert.equal(typeof pcd[name] !== 'undefined', true, `missing export: ${name}`);
  }
});
