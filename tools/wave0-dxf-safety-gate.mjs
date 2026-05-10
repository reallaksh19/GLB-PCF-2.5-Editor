#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPORT_DIR = 'reports/wave0';
const JSON_OUT = path.join(REPORT_DIR, 'wave0-dxf-safety-gate.json');
const MD_OUT = path.join(REPORT_DIR, 'wave0-dxf-safety-gate.md');
const INVENTORY_PATH = 'reports/dxf-fid-01.inventory.json';

function nowIso() {
  return new Date().toISOString();
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function ensureParentDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function runNpmScript(id, title, scriptName) {
  const startedAt = nowIso();

  const result = spawnSync(npmCommand(), ['run', scriptName], {
    encoding: 'utf8',
    shell: false,
    timeout: 180000,
  });

  return {
    id,
    title,
    scriptName,
    startedAt,
    finishedAt: nowIso(),
    status: result.status,
    signal: result.signal || null,
    passed: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readJsonSafe(file) {
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      value: null,
      error: null,
    };
  }

  try {
    return {
      exists: true,
      value: JSON.parse(fs.readFileSync(file, 'utf8')),
      error: null,
    };
  } catch (err) {
    return {
      exists: true,
      value: null,
      error: String(err?.message || err),
    };
  }
}

function summarizeInventory(readResult) {
  if (!readResult.exists) {
    return {
      exists: false,
      parseError: null,
      entityCount: 0,
      byType: {},
      issueCount: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
    };
  }

  if (readResult.error) {
    return {
      exists: true,
      parseError: readResult.error,
      entityCount: 0,
      byType: {},
      issueCount: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
    };
  }

  const inv = readResult.value || {};
  const issues = Array.isArray(inv.issues) ? inv.issues : [];

  return {
    exists: true,
    parseError: null,
    contract: inv.contract || null,
    file: inv.file || null,
    fileSizeBytes: inv.fileSizeBytes || 0,
    entityCount: Number(inv.entityCount || 0),
    byType: inv.byType || {},
    issueCount: issues.length,
    highRiskCount: issues.filter((i) => i.severity === 'HIGH').length,
    mediumRiskCount: issues.filter((i) => i.severity === 'MEDIUM').length,
    lowRiskCount: issues.filter((i) => i.severity === 'LOW').length,
    extents: inv.extents || null,
  };
}

function requiredFailure(step) {
  return !step.passed;
}

function statusLabel(step) {
  return step.passed ? 'PASS' : 'FAIL';
}

function markdown(report) {
  const lines = [];

  lines.push('# Slice 1 / Wave 0 DXF Safety Gate');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`Overall result: **${report.passed ? 'PASS' : 'FAIL'}**`);
  lines.push('');
  lines.push('## Gate Summary');
  lines.push('');
  lines.push('| Step | Script | Status |');
  lines.push('|---|---|---:|');

  for (const step of report.steps) {
    lines.push(`| ${step.title} | \`npm run ${step.scriptName}\` | ${statusLabel(step)} |`);
  }

  lines.push('');
  lines.push('## Inventory Summary');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.inventorySummary, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Failure Notes');
  lines.push('');

  if (!report.failureNotes.length) {
    lines.push('None.');
  } else {
    for (const note of report.failureNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push('');
  lines.push('## Step Output');
  lines.push('');

  for (const step of report.steps) {
    lines.push(`### ${step.id} — ${step.title}`);
    lines.push('');
    lines.push(`Script: \`npm run ${step.scriptName}\``);
    lines.push('');
    lines.push(`Status: **${statusLabel(step)}**`);
    lines.push('');
    lines.push('STDOUT:');
    lines.push('```text');
    lines.push(String(step.stdout || '').trim() || '(empty)');
    lines.push('```');
    lines.push('');
    lines.push('STDERR:');
    lines.push('```text');
    lines.push(String(step.stderr || '').trim() || '(empty)');
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

const startedAt = nowIso();

const steps = [
  runNpmScript('S1-001', 'Real DXF file gate', 'dxf:real-gate'),
  runNpmScript('S1-002', 'DXF fidelity smoke tests', 'test:dxf-fidelity'),
  runNpmScript('S1-003', 'DXF inventory scan', 'dxf:fid01'),
];

const inventoryRead = readJsonSafe(INVENTORY_PATH);
const inventorySummary = summarizeInventory(inventoryRead);

const failureNotes = [];

for (const step of steps) {
  if (requiredFailure(step)) {
    failureNotes.push(`${step.id} failed: npm run ${step.scriptName}`);
  }
}

if (!inventorySummary.exists) {
  failureNotes.push(`Inventory JSON was not generated: ${INVENTORY_PATH}`);
}

if (inventorySummary.parseError) {
  failureNotes.push(`Inventory JSON parse failed: ${inventorySummary.parseError}`);
}

if (inventorySummary.exists && !inventorySummary.parseError && inventorySummary.entityCount <= 0) {
  failureNotes.push('Inventory entityCount is zero; DXF validation is not meaningful.');
}

const report = {
  contract: 'SLICE-1-DXF-SAFETY-GATE-1.0.0',
  generatedAt: nowIso(),
  startedAt,
  finishedAt: nowIso(),
  passed: steps.every((s) => s.passed) && failureNotes.length === 0,
  reportPaths: {
    json: JSON_OUT,
    markdown: MD_OUT,
    inventory: INVENTORY_PATH,
  },
  steps,
  inventorySummary,
  failureNotes,
};

ensureParentDir(JSON_OUT);
ensureParentDir(MD_OUT);

fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(MD_OUT, markdown(report), 'utf8');

console.log(report.passed ? 'PASS slice1-dxf-safety-gate' : 'FAIL slice1-dxf-safety-gate', {
  json: JSON_OUT,
  markdown: MD_OUT,
  inventory: INVENTORY_PATH,
  failureNotes: failureNotes.length,
});

process.exit(report.passed ? 0 : 1);
