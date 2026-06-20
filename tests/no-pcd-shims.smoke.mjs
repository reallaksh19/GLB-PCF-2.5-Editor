import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = join(ROOT, 'reports', 'phase0');
const REPORT_PATH = join(REPORT_DIR, 'no-pcd-shims.json');
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
const IGNORED_FILES = new Set(['tests/no-pcd-shims.smoke.mjs']);
const BLOCKED_PATH_PARTS = [
  'pipe-component-data-adapter',
  'pcd-adapter',
  'pipecomponentdata-adapter',
  'pipe-component-data-wrapper',
  'pcd-wrapper',
  'pipe-component-data-shim',
  'pcd-shim',
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
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

function isCode(path) {
  return CODE_EXTENSIONS.has(extname(path));
}

function hasInternalPipeComponentDataImport(text) {
  const importLines = text.split(/\r\n|\r|\n/).filter((line) => line.includes('from '));
  return importLines.some((line) => {
    const normalized = line.replaceAll('\\', '/');
    const marker = 'pipe-component-data/src/';
    if (!normalized.includes(marker)) return false;
    return !normalized.includes('pipe-component-data/src/index.js');
  });
}

function writeReport(violations) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify({ violations }, null, 2)}\n`);
}

test('PipeComponentData is consumed directly through its public entrypoint', () => {
  const violations = [];
  for (const path of walk(ROOT)) {
    const rel = relative(ROOT, path).replaceAll('\\', '/');
    if (IGNORED_FILES.has(rel)) continue;
    const lower = rel.toLowerCase();
    if (BLOCKED_PATH_PARTS.some((part) => lower.includes(part))) {
      violations.push({ path: rel, reason: 'blocked local adapter/wrapper/shim path' });
      continue;
    }
    if (!isCode(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (hasInternalPipeComponentDataImport(text)) {
      violations.push({ path: rel, reason: 'imports PipeComponentData internals instead of public package exports' });
    }
  }

  writeReport(violations);
  assert.deepEqual(violations, [], 'No PipeComponentData shim/wrapper/internal-import violations are allowed. See reports/phase0/no-pcd-shims.json');
});
