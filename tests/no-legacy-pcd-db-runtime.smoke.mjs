import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CODE_EXTENSIONS = new Set(['.js', '.mjs']);
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'reports',
  'Comments',
  '.playwright',
  'playwright-report',
  'test-results',
]);
const ALLOWED_PREFIXES = [
  'vendor/pipe-component-data/',
  'tests/no-legacy-pcd-db-runtime.smoke.mjs',
  'tests/pcd-vendor.smoke.mjs',
];

function extname(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot) : '';
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (IGNORED_DIRS.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (stat.isFile() && CODE_EXTENSIONS.has(extname(path))) out.push(path);
  }
  return out;
}

function isAllowed(rel) {
  return ALLOWED_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix));
}

test('downstream runtime does not use legacy createPipeDataDb lookup path', () => {
  const violations = [];
  for (const path of walk(ROOT)) {
    const rel = relative(ROOT, path).replaceAll('\\', '/');
    if (isAllowed(rel)) continue;
    const text = readFileSync(path, 'utf8');
    if (text.includes('createPipeDataDb')) violations.push(rel);
  }

  assert.deepEqual(
    violations,
    [],
    `Use public lookupComponentExact()/LOOKUP_STATUS instead of createPipeDataDb outside vendor:\n${violations.join('\n')}`,
  );
});
