import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd());
const MAX_LINES = 300;
const EXTENSIONS = new Set(['.js', '.mjs']);
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

function extname(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot) : '';
}

function shouldSkipDirectory(name) {
  return IGNORED_DIRS.has(name);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (shouldSkipDirectory(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (stat.isFile() && EXTENSIONS.has(extname(name))) out.push(path);
  }
  return out;
}

function countLines(path) {
  const text = readFileSync(path, 'utf8');
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

test('all JavaScript modules stay at or below 300 lines', () => {
  const oversized = walk(ROOT)
    .map((path) => ({ path: relative(ROOT, path).replaceAll('\\', '/'), lines: countLines(path) }))
    .filter((entry) => entry.lines > MAX_LINES)
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

  assert.deepEqual(
    oversized,
    [],
    `Modules above ${MAX_LINES} lines must be split:\n${oversized
      .map((entry) => `- ${entry.path}: ${entry.lines} lines`)
      .join('\n')}`,
  );
});
