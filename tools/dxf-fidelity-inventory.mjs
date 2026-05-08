#!/usr/bin/env node
/**
 * DXF-FID-01 — Standalone DXF entity inventory.
 *
 * Purpose:
 *   Produce a deterministic, parser-independent inventory of a DXF file before
 *   debugging render/import fidelity. This deliberately uses raw DXF group-code
 *   scanning instead of the app importer, so it can reveal unsupported entities
 *   even when the runtime DXF parser or renderer fails.
 *
 * Usage:
 *   node tools/dxf-fidelity-inventory.mjs Comments/dxf-1/file.dxf
 *   node tools/dxf-fidelity-inventory.mjs Comments/dxf-1/file.dxf --json reports/dxf-fid-01.inventory.json
 */

import fs from 'node:fs';
import path from 'node:path';

const ENTITY_TYPES = new Set([
  'LINE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'ARC', 'CIRCLE',
  'ELLIPSE', 'SPLINE', 'POINT', 'TEXT', 'MTEXT', 'INSERT', 'HATCH',
  'DIMENSION', 'SOLID', 'TRACE', '3DFACE', 'XLINE', 'RAY', 'LEADER',
  'MULTILEADER', 'IMAGE', 'WIPEOUT', 'VIEWPORT', 'ATTRIB', 'ATTDEF',
]);

function usage(exitCode = 1) {
  console.error('Usage: node tools/dxf-fidelity-inventory.mjs <file.dxf> [--json output.json]');
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = [...argv];
  const file = args.shift();
  if (!file || file === '--help' || file === '-h') usage(file ? 0 : 1);
  let jsonOut = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') {
      jsonOut = args[i + 1];
      i += 1;
    }
  }
  return { file, jsonOut };
}

function readPairs(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const codeRaw = lines[i].trim();
    const value = lines[i + 1]?.trim() ?? '';
    if (!codeRaw) continue;
    const code = Number(codeRaw);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value, line: i + 1 });
  }
  return pairs;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyEntity(type, startLine) {
  return {
    type,
    startLine,
    handle: null,
    layer: null,
    points: [],
    vertices: [],
    bulges: [],
    radius: null,
    startAngle: null,
    endAngle: null,
    blockName: null,
    text: null,
    rawGroupCount: 0,
  };
}

function pushPointFromCodes(entity, coords) {
  if (coords.x == null || coords.y == null) return;
  entity.points.push({ x: coords.x, y: coords.y, z: coords.z ?? 0 });
}

function parseEntities(pairs) {
  const entities = [];
  let inEntities = false;
  let current = null;
  let coords = {};

  function closeCurrent() {
    if (!current) return;
    pushPointFromCodes(current, coords);
    entities.push(current);
    current = null;
    coords = {};
  }

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const next = pairs[i + 1];

    if (pair.code === 0 && pair.value === 'SECTION' && next?.code === 2 && next.value === 'ENTITIES') {
      inEntities = true;
      i += 1;
      continue;
    }
    if (inEntities && pair.code === 0 && pair.value === 'ENDSEC') {
      closeCurrent();
      inEntities = false;
      continue;
    }
    if (!inEntities) continue;

    if (pair.code === 0 && ENTITY_TYPES.has(pair.value)) {
      closeCurrent();
      current = emptyEntity(pair.value, pair.line);
      continue;
    }

    if (!current) continue;
    current.rawGroupCount += 1;

    switch (pair.code) {
      case 5:
        current.handle ||= pair.value;
        break;
      case 8:
        current.layer ||= pair.value;
        break;
      case 2:
        if (current.type === 'INSERT') current.blockName ||= pair.value;
        break;
      case 1:
        if (current.type === 'TEXT' || current.type === 'MTEXT') current.text ||= pair.value;
        break;
      case 10:
        pushPointFromCodes(current, coords);
        coords = { x: numberOrNull(pair.value), y: null, z: 0 };
        break;
      case 20:
        coords.y = numberOrNull(pair.value);
        break;
      case 30:
        coords.z = numberOrNull(pair.value) ?? 0;
        break;
      case 40:
        if (['ARC', 'CIRCLE'].includes(current.type)) current.radius = numberOrNull(pair.value);
        break;
      case 42:
        if (['LWPOLYLINE', 'POLYLINE', 'VERTEX'].includes(current.type)) {
          current.bulges.push(numberOrNull(pair.value) ?? 0);
        }
        break;
      case 50:
        current.startAngle = numberOrNull(pair.value);
        break;
      case 51:
        current.endAngle = numberOrNull(pair.value);
        break;
      default:
        break;
    }
  }

  closeCurrent();
  return entities;
}

function summarize(file, text, entities) {
  const byType = {};
  const byLayer = {};
  const issues = [];
  const entityDetails = [];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const updateExtents = (p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
  };

  for (const ent of entities) {
    byType[ent.type] = (byType[ent.type] || 0) + 1;
    const layer = ent.layer || '<none>';
    byLayer[layer] = (byLayer[layer] || 0) + 1;
    for (const p of ent.points) updateExtents(p);

    const hasBulge = ent.bulges.some((b) => Math.abs(Number(b) || 0) > 1e-12);
    const detail = {
      type: ent.type,
      handle: ent.handle,
      layer: ent.layer,
      startLine: ent.startLine,
      pointCount: ent.points.length,
      bulgeCount: ent.bulges.length,
      hasBulge,
      radius: ent.radius,
      startAngle: ent.startAngle,
      endAngle: ent.endAngle,
      blockName: ent.blockName,
    };
    entityDetails.push(detail);

    if (['LWPOLYLINE', 'POLYLINE'].includes(ent.type) && hasBulge) {
      issues.push({ severity: 'HIGH', code: 'POLYLINE_BULGE_PRESENT', handle: ent.handle, layer: ent.layer, message: 'Polyline contains bulge arcs; straight vertex segmentation will not match AutoCAD.' });
    }
    if (ent.type === 'SPLINE') {
      issues.push({ severity: 'HIGH', code: 'SPLINE_PRESENT', handle: ent.handle, layer: ent.layer, message: 'Spline entity requires curve rendering or curve-to-segment conversion.' });
    }
    if (ent.type === 'INSERT') {
      issues.push({ severity: 'MEDIUM', code: 'INSERT_PRESENT', handle: ent.handle, layer: ent.layer, blockName: ent.blockName, message: 'Block INSERT requires block expansion for AutoCAD visual fidelity.' });
    }
    if (ent.type === 'HATCH') {
      issues.push({ severity: 'LOW', code: 'HATCH_PRESENT', handle: ent.handle, layer: ent.layer, message: 'HATCH may affect visual comparison but not pipe centerline topology.' });
    }
  }

  const hasExtents = minX !== Infinity;
  return {
    contract: 'DXF-FID-01-INVENTORY-1.0.0',
    file: path.normalize(file),
    fileSizeBytes: Buffer.byteLength(text),
    entityCount: entities.length,
    byType,
    byLayer,
    extents: hasExtents ? {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    } : null,
    issues,
    entityDetails,
  };
}

function printSummary(summary) {
  console.log('\nDXF-FID-01 Entity Inventory');
  console.log('='.repeat(32));
  console.log(`File: ${summary.file}`);
  console.log(`Size: ${summary.fileSizeBytes} bytes`);
  console.log(`Entities: ${summary.entityCount}`);
  console.log('\nBy type:');
  for (const [type, count] of Object.entries(summary.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(14)} ${count}`);
  }
  console.log('\nTop layers:');
  for (const [layer, count] of Object.entries(summary.byLayer).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(layer).padEnd(32)} ${count}`);
  }
  if (summary.extents) {
    console.log('\nExtents:');
    console.log(`  min ${JSON.stringify(summary.extents.min)}`);
    console.log(`  max ${JSON.stringify(summary.extents.max)}`);
    console.log(`  size ${JSON.stringify(summary.extents.size)}`);
  }
  console.log('\nFidelity risks:');
  if (!summary.issues.length) console.log('  none detected by inventory scanner');
  for (const issue of summary.issues.slice(0, 50)) {
    console.log(`  [${issue.severity}] ${issue.code} handle=${issue.handle || '-'} layer=${issue.layer || '-'} ${issue.blockName ? `block=${issue.blockName} ` : ''}- ${issue.message}`);
  }
  if (summary.issues.length > 50) console.log(`  ... ${summary.issues.length - 50} more`);
}

const { file, jsonOut } = parseArgs(process.argv.slice(2));
if (!fs.existsSync(file)) {
  console.error(`DXF file not found: ${file}`);
  process.exit(2);
}
const text = fs.readFileSync(file, 'utf8');
if (!text.trim()) {
  console.error(`DXF file is empty: ${file}`);
  process.exit(3);
}
const pairs = readPairs(text);
const entities = parseEntities(pairs);
const summary = summarize(file, text, entities);
printSummary(summary);

if (jsonOut) {
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
  console.log(`\nWrote JSON inventory: ${jsonOut}`);
}
