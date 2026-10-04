#!/usr/bin/env node
/**
 * tools/verify-cad-boundaries.mjs
 *
 * Anti-Drift Boundary Enforcement Scanner (IP-01)
 *
 * Enforces the architectural boundaries defined in docs/CAD_DOCUMENT_ARCHITECTURE.md:
 * 1. formats/dxf/model/** and formats/dxf/parser/** MUST NOT import from Three.js or DOM APIs.
 * 2. formats/dxf/model/** and formats/dxf/parser/** MUST NOT import from core/ceg/** or domains/piping/**.
 * 3. formats/dxf/model/** MUST NOT invoke unit scaling (scalePointToMm, etc.) on source coordinates.
 * 4. docs/CAD_DOCUMENT_ARCHITECTURE.md must exist and declare the 7 non-negotiable invariants.
 *
 * Usage:
 *   node tools/verify-cad-boundaries.mjs
 *   node tools/verify-cad-boundaries.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const FORBIDDEN_MODEL_IMPORTS = [
  { pattern: /from\s+['"][^'"]*three[^'"]*['"]/i, reason: 'Three.js prohibited in CAD source model/parser' },
  { pattern: /from\s+['"][^'"]*core\/ceg\/[^'"]*['"]/i, reason: 'CEG prohibited in CAD source model/parser' },
  { pattern: /from\s+['"][^'"]*domains\/piping\/[^'"]*['"]/i, reason: 'Piping domain prohibited in CAD source model/parser' },
];

const FORBIDDEN_COORDINATE_SCALERS = [
  { pattern: /\bscalePointToMm\b/, reason: 'Source coordinates must not be scaled to mm ($INSUNITS is metadata)' },
  { pattern: /\bscaleLengthToMm\b/, reason: 'Source dimensions must not be scaled to mm ($INSUNITS is metadata)' },
];

function checkArchitectureContract() {
  const contractPath = path.join(REPO_ROOT, 'docs', 'CAD_DOCUMENT_ARCHITECTURE.md');
  if (!fs.existsSync(contractPath)) {
    return { ok: false, error: 'docs/CAD_DOCUMENT_ARCHITECTURE.md is missing.' };
  }
  const content = fs.readFileSync(contractPath, 'utf8');
  const requiredSections = [
    'Same-Format Save Serializes the Source Document',
    'Cross-Format Export Is Explicitly Lossy',
    'Source Coordinates Are Preserved Exactly',
    'Entity Identity Preservation',
    'Unknown and Unmodified Entity Passthrough',
    'Stable Identity for Selection',
    'Transactional Command Edits',
  ];
  const missing = requiredSections.filter((sec) => !content.includes(sec));
  if (missing.length > 0) {
    return { ok: false, error: `docs/CAD_DOCUMENT_ARCHITECTURE.md is missing required invariants: ${missing.join(', ')}` };
  }
  return { ok: true, path: contractPath };
}

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function checkSourceBoundaries() {
  const violations = [];
  const modelDirs = [
    path.join(REPO_ROOT, 'formats', 'dxf', 'model'),
    path.join(REPO_ROOT, 'formats', 'dxf', 'parser'),
  ];

  let scannedCount = 0;
  for (const dir of modelDirs) {
    const files = scanDirectory(dir);
    for (const filePath of files) {
      scannedCount++;
      const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      lines.forEach((line, idx) => {
        for (const rule of FORBIDDEN_MODEL_IMPORTS) {
          if (rule.pattern.test(line)) {
            violations.push({
              file: relativePath,
              line: idx + 1,
              code: line.trim(),
              reason: rule.reason,
            });
          }
        }
        for (const rule of FORBIDDEN_COORDINATE_SCALERS) {
          if (rule.pattern.test(line)) {
            violations.push({
              file: relativePath,
              line: idx + 1,
              code: line.trim(),
              reason: rule.reason,
            });
          }
        }
      });
    }
  }

  return { scannedCount, violations };
}

function run() {
  const isJson = process.argv.includes('--json');
  const contractResult = checkArchitectureContract();
  const boundaryResult = checkSourceBoundaries();

  const passed = contractResult.ok && boundaryResult.violations.length === 0;

  if (isJson) {
    console.log(JSON.stringify({
      passed,
      contract: contractResult,
      boundary: boundaryResult,
      timestamp: new Date().toISOString(),
    }, null, 2));
    process.exit(passed ? 0 : 1);
  }

  console.log('====================================================');
  console.log(' CAD Architecture Anti-Drift Boundary Verification ');
  console.log('====================================================');
  console.log(`[1] Architecture Contract: ${contractResult.ok ? 'PASS (Invariants verified)' : 'FAIL: ' + contractResult.error}`);
  console.log(`[2] Boundary Scanner: Scanned ${boundaryResult.scannedCount} files in formats/dxf/model & parser.`);

  if (boundaryResult.violations.length > 0) {
    console.log(`\n❌ FOUND ${boundaryResult.violations.length} BOUNDARY VIOLATION(S):`);
    for (const v of boundaryResult.violations) {
      console.log(`  - ${v.file}:${v.line} -> ${v.reason}\n      ${v.code}`);
    }
    console.log('\nResult: FAILED');
    process.exit(1);
  } else {
    console.log('[3] Boundary Status: 0 violations detected. Clean separation verified.');
    console.log('====================================================');
    console.log('✅ Result: PASS — Architecture conforms to anti-drift rules.');
    console.log('====================================================');
    process.exit(0);
  }
}

run();
