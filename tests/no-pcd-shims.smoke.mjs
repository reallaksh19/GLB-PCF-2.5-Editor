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
const BLOCKED_PATH_PARTS = [
  'pipe-component-data-adapter',
  'pcd-adapter',
  'pipecomponentdata-adapter',
  'pipe-component-data-wrapper',
  'pcd-wrapper',
  'pipe-component-data-shim',
  'pcd-shim',
];
const INTERNAL_PCD_IMPORT = /from\s+['"][^'"]*vendor\/pipe-component-data\/src\//;
const RELATIVE_INTERNAL_PCD_IMPORT = /from\s+['"][^'"]*pipe-component-data\/src\//;

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
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

function isCode(path) {
  return CODE_EXTENSIONS.has(extname(path));
}

test('PipeComponentData is consumed directly through its public entrypoint', () => {
  const violations = [];
  for (const path of walk(ROOT)) {
    const rel = relative(ROOT, path).replaceAll('\\', '/');
    const lower = rel.toLowerCase();
    if (BLOCKED_PATH_PARTS.some((part) => lower.includes(part))) {
      violations.push(`${rel}: blocked local adapter/wrapper/shim path`);
      continue;
    }
    if (!isCode(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (INTERNAL_PCD_IMPORT.test(text) || RELATIVE_INTERNAL_PCD_IMPORT.test(text)) {
      violations.push(`${rel}: imports PipeComponentData internals instead of public package exports`);
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
