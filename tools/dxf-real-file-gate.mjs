#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf';

function fail(message) {
  console.error(`FAIL dxf-real-file-gate: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) {
  fail(`DXF file does not exist: ${file}`);
}

const stat = fs.statSync(file);
if (stat.size <= 0) {
  fail(`DXF file is empty: ${file}`);
}

const text = fs.readFileSync(file, 'utf8');
if (!text.trim()) {
  fail(`DXF file contains only whitespace: ${file}`);
}

if (!/\bSECTION\b/i.test(text) || !/\bENTITIES\b/i.test(text)) {
  fail(`DXF file does not look like an ASCII DXF with SECTION/ENTITIES: ${file}`);
}

const entityCount = (text.match(/\n0\s*\n[A-Z0-9_-]+/gi) || []).length;
if (entityCount < 10) {
  fail(`DXF entity marker count looks too low: ${entityCount}`);
}

console.log('PASS dxf-real-file-gate', {
  file,
  bytes: stat.size,
  entityMarkerCount: entityCount,
});
