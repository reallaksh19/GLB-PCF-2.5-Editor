import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd());
const BASELINE_PATH = join(ROOT, 'tests', 'module-size-baseline.json');
const BASELINE = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const MAX_LINES = BASELINE.maxLines;
const EXTENSIONS = new Set(['.js', '.mjs']);
const REPORT_DIR = join(ROOT, 'reports', 'phase0');
const REPORT_PATH = join(REPORT_DIR, 'no-large-modules.json');
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

function writeReport(payload) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

test('JavaScript modules obey the 600-line gate and baseline debt may not grow', () => {
  const baseline = BASELINE.oversized || {};
  const oversized = walk(ROOT)
    .map((path) => ({ path: relative(ROOT, path).replaceAll('\\', '/'), lines: countLines(path) }))
    .filter((entry) => entry.lines > MAX_LINES)
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

  const newOversized = oversized.filter((entry) => !(entry.path in baseline));
  const grownBaseline = oversized.filter((entry) => baseline[entry.path] && entry.lines > baseline[entry.path]);
  const removedDebt = Object.keys(baseline).filter((path) => !oversized.some((entry) => entry.path === path));
  const report = { maxLines: MAX_LINES, newOversized, grownBaseline, remainingBaselineDebt: oversized, removedDebt };
  writeReport(report);

  assert.deepEqual(newOversized, [], `New modules above ${MAX_LINES} lines are blocked. See reports/phase0/no-large-modules.json`);
  assert.deepEqual(grownBaseline, [], `Baseline oversized modules may not grow. See reports/phase0/no-large-modules.json`);
});
