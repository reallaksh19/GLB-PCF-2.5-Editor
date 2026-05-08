#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

function exists(file) {
  return Boolean(file && fs.existsSync(file));
}

function readJson(file) {
  if (!exists(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function count(inv, type) {
  return Number(inv?.entityCounts?.[type] || inv?.countsByType?.[type] || 0);
}

function hasRisk(inv, code) {
  const risks = inv?.fidelityRisks || inv?.risks || [];
  return risks.some((r) => String(r.code || r).includes(code));
}

function classify(inv) {
  const findings = [];
  const insertCount = count(inv, 'INSERT');
  const polyCount = count(inv, 'POLYLINE') + count(inv, 'LWPOLYLINE');
  const splineCount = count(inv, 'SPLINE');
  const textCount = count(inv, 'TEXT') + count(inv, 'MTEXT');
  const hatchCount = count(inv, 'HATCH');

  if (insertCount > 0) {
    findings.push({
      phase: 'FID-08E',
      severity: 'HIGH',
      code: 'BLOCK_INSERT_PRESENT',
      action: 'Verify FID-04 block expansion against AutoCAD symbols.',
      evidence: { insertCount },
    });
  }

  if (polyCount > 0 || hasRisk(inv, 'POLYLINE_BULGE')) {
    findings.push({
      phase: 'FID-08B',
      severity: hasRisk(inv, 'POLYLINE_BULGE') ? 'HIGH' : 'MEDIUM',
      code: 'POLYLINE_RECONSTRUCTION_REQUIRED',
      action: 'Verify FID-03 bulge and closed-polyline reconstruction.',
      evidence: { polyCount, bulgeRisk: hasRisk(inv, 'POLYLINE_BULGE') },
    });
  }

  if (splineCount > 0) {
    findings.push({
      phase: 'FID-08B',
      severity: 'MEDIUM',
      code: 'SPLINE_PRESENT',
      action: 'Verify spline guide visibility or tolerance conversion.',
      evidence: { splineCount },
    });
  }

  if (textCount > 0) {
    findings.push({
      phase: 'FID-08C',
      severity: 'MEDIUM',
      code: 'TEXT_MTEXT_PRESENT',
      action: 'Verify FID-06 text/MTEXT visibility, height, color, rotation.',
      evidence: { textCount },
    });
  }

  if (hatchCount > 0) {
    findings.push({
      phase: 'FID-08F',
      severity: 'LOW',
      code: 'HATCH_PRESENT',
      action: 'Decide whether hatch/fill is required or loss-contract only.',
      evidence: { hatchCount },
    });
  }

  return findings;
}

function markdown(report) {
  return `# DXF-FID-08 Real Drawing Triage

## Inputs

- DXF: \`${report.inputs.dxf}\`
- Inventory: \`${report.inputs.inventory}\`
- AutoCAD reference: \`${report.inputs.autocad}\`
- Canvas screenshot: \`${report.inputs.canvas}\`

## Evidence

\`\`\`json
${JSON.stringify(report.evidence, null, 2)}
\`\`\`

## Findings

${report.findings.map((f) => `### ${f.phase} — ${f.code}

- Severity: **${f.severity}**
- Evidence: \`${JSON.stringify(f.evidence)}\`
- Action: ${f.action}
`).join('\n')}

## Manual Checklist

| Check | Status | Notes |
|---|---:|---|
| Overall extents match AutoCAD | Pending | |
| Curves/arcs preserve shape | Pending | |
| Block symbols visible | Pending | |
| Text/MTEXT visible | Pending | |
| Layer/color readability | Pending | |
| Remaining primary defect class | Pending | |
`;
}

const inputs = {
  inventory: arg('--inventory', 'reports/dxf-fid-01.inventory.json'),
  dxf: arg('--dxf', 'Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf'),
  autocad: arg('--autocad', 'Comments/dxf-1/actual geometry dxf _in AutoCad dwg viewer.jpg'),
  canvas: arg('--canvas', 'Comments/dxf-1/dxf on canvas upon import.jpg'),
  json: arg('--json', 'reports/fid08/dxf-fid08-triage.json'),
  md: arg('--md', 'reports/fid08/dxf-fid08-triage.md'),
};

const inventory = readJson(inputs.inventory);
const findings = classify(inventory);

const report = {
  generatedAt: new Date().toISOString(),
  inputs,
  evidence: {
    inventoryExists: exists(inputs.inventory),
    dxfExists: exists(inputs.dxf),
    autocadExists: exists(inputs.autocad),
    canvasExists: exists(inputs.canvas),
  },
  findings,
};

ensureDir(inputs.json);
ensureDir(inputs.md);
fs.writeFileSync(inputs.json, JSON.stringify(report, null, 2));
fs.writeFileSync(inputs.md, markdown(report));
console.log('PASS dxf-fid08-triage', { findings: findings.length, json: inputs.json, md: inputs.md });
