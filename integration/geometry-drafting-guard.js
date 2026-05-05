/**
 * integration/geometry-drafting-guard.js
 * M0 static guardrails for shared drafting parser usage.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GEOMETRY_DRAFTING_GUARD_VERSION = 'M0-GUARD-1.0.0';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertContains(text, pattern, message, failures) {
  if (!pattern.test(text)) failures.push(message);
}

/**
 * Validate parser/HUD/macro wiring against M0 guardrails.
 */
export function runGeometryDraftingGuard(repoRoot) {
  const root = String(repoRoot || process.cwd());
  const failures = [];

  const parserFile = path.join(root, 'editor', 'draft-command-parser.js');
  const routeInputFile = path.join(root, 'editor', 'route-segment-input.js');
  const hudParserFile = path.join(root, 'hud', 'hud-line-command-parser.js');
  const hudCommitFile = path.join(root, 'hud', 'hud-line-draw.js');
  const macroFile = path.join(root, 'macro', 'macro-commands.js');

  const requiredFiles = [parserFile, routeInputFile, hudParserFile, hudCommitFile, macroFile];
  for (const filePath of requiredFiles) {
    if (!fs.existsSync(filePath)) failures.push(`Missing required file: ${path.relative(root, filePath)}`);
  }
  if (failures.length) return { ok: false, failures, version: GEOMETRY_DRAFTING_GUARD_VERSION };

  const hudParserSource = readText(hudParserFile);
  const hudCommitSource = readText(hudCommitFile);
  const macroSource = readText(macroFile);

  assertContains(
    hudParserSource,
    /from\s+['"]\.\.\/editor\/route-segment-input\.js['"]/,
    'HUD parser adapter must import editor/route-segment-input.js',
    failures
  );
  assertContains(
    hudCommitSource,
    /parseHudLineCommand/,
    'HUD line commit must resolve tokens via parseHudLineCommand',
    failures
  );
  assertContains(
    macroSource,
    /parseDraftCommandOrThrow/,
    'Macro commands must use shared draft command parser',
    failures
  );
  assertContains(
    macroSource,
    /register\('LINE'/,
    'Macro LINE precision command must be registered',
    failures
  );

  return {
    ok: failures.length === 0,
    failures,
    version: GEOMETRY_DRAFTING_GUARD_VERSION,
  };
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(modulePath)) {
  const result = runGeometryDraftingGuard(process.cwd());
  if (!result.ok) {
    console.error('Geometry drafting guard failed');
    for (const failure of result.failures) console.error(` - ${failure}`);
    process.exit(1);
  }
  console.log('Geometry drafting guard passed', { version: result.version });
}
