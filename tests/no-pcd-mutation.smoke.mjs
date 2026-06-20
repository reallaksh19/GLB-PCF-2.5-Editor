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
  'vendor',
]);
const PCD_IMPORT = /from\s+['"](?:pipe-component-data|\.\.\/vendor\/pipe-component-data\/src\/index\.js|\.\/vendor\/pipe-component-data\/src\/index\.js)['"]/;
const MUTATION_PATTERNS = [
  /Object\.assign\s*\(/,
  /\bdelete\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/,
  /\b(?:row|record|component|catalog|graph|adapterGraph|ceg)\.[A-Za-z_$][\w$]*\s*(?:=|\+=|-=|\*=|\/=)/,
  /\b(?:rows|components|anchors|ports|diagnostics|topologyLinks)\.(?:push|pop|shift|unshift|splice|sort|reverse)\s*\(/,
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
    else if (stat.isFile() && CODE_EXTENSIONS.has(extname(name))) out.push(path);
  }
  return out;
}

test('downstream PipeComponentData consumers avoid mutating imported graph/catalog data', () => {
  const violations = [];
  for (const path of walk(ROOT)) {
    const text = readFileSync(path, 'utf8');
    if (!PCD_IMPORT.test(text)) continue;
    const lines = text.split(/\r\n|\r|\n/);
    lines.forEach((line, index) => {
      if (MUTATION_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push(`${relative(ROOT, path).replaceAll('\\', '/')}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `PipeComponentData consumers must use immutable construction, not mutation:\n${violations.join('\n')}`,
  );
});
