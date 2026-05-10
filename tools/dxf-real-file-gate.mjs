#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf';

function fail(message, extra = {}) {
  console.error('FAIL dxf-real-file-gate', {
    message,
    ...extra,
  });
  process.exit(1);
}

function pass(payload) {
  console.log('PASS dxf-real-file-gate', payload);
}

function looksLikeGitLfsPointer(text) {
  return (
    /^version https:\/\/git-lfs.github.com\/spec\/v1/m.test(text) &&
    /^oid sha256:/m.test(text) &&
    /^size \d+/m.test(text)
  );
}

function looksBinary(buffer) {
  if (!buffer.length) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let nulCount = 0;
  let controlCount = 0;

  for (const b of sample) {
    if (b === 0) nulCount += 1;

    // Allow tab, LF, CR. Treat other low control bytes as suspicious.
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
      controlCount += 1;
    }
  }

  return nulCount > 0 || controlCount > Math.max(8, sample.length * 0.02);
}

function normalizeText(buffer) {
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function countDxfZeroEntityMarkers(text) {
  // DXF group-code entity records normally use:
  // 0
  // ENTITY_NAME
  //
  // Support LF and CRLF.
  return (text.match(/(?:^|\r?\n)\s*0\s*\r?\n\s*[A-Z][A-Z0-9_-]*/g) || []).length;
}

function hasDxfSection(text, sectionName) {
  const pattern = new RegExp(
    String.raw`(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\s*\r?\n\s*2\s*\r?\n\s*${sectionName}\s*(?:\r?\n|$)`,
    'i'
  );
  return pattern.test(text);
}

if (!fs.existsSync(file)) {
  fail(`DXF file does not exist: ${file}`, { file });
}

const stat = fs.statSync(file);

if (!stat.isFile()) {
  fail(`DXF path is not a file: ${file}`, { file });
}

if (stat.size <= 0) {
  fail(`DXF file is empty: ${file}`, { file, bytes: stat.size });
}

const buffer = fs.readFileSync(file);

if (looksBinary(buffer)) {
  const headerText = buffer.subarray(0, Math.min(buffer.length, 128)).toString('latin1');

  if (/AutoCAD Binary DXF/i.test(headerText)) {
    fail('Binary DXF detected. Current importer expects ASCII DXF.', {
      file,
      bytes: stat.size,
      header: headerText.slice(0, 80),
    });
  }

  fail('Binary or non-text DXF payload detected. Current gate expects ASCII DXF.', {
    file,
    bytes: stat.size,
  });
}

const text = normalizeText(buffer);
const trimmed = text.trim();

if (!trimmed) {
  fail(`DXF file contains only whitespace: ${file}`, { file, bytes: stat.size });
}

if (looksLikeGitLfsPointer(trimmed)) {
  fail('DXF file is a Git LFS pointer, not the real DXF payload.', {
    file,
    bytes: stat.size,
    preview: trimmed.slice(0, 160),
  });
}

if (stat.size < 1024) {
  fail('DXF file is suspiciously small. This usually means a placeholder or truncated file.', {
    file,
    bytes: stat.size,
  });
}

if (!/\bSECTION\b/i.test(text)) {
  fail('DXF file does not contain SECTION marker.', { file, bytes: stat.size });
}

if (!/\bENTITIES\b/i.test(text)) {
  fail('DXF file does not contain ENTITIES marker.', { file, bytes: stat.size });
}

if (!hasDxfSection(text, 'ENTITIES')) {
  fail('DXF file does not contain a valid SECTION/ENTITIES group-code block.', {
    file,
    bytes: stat.size,
  });
}

const entityMarkerCount = countDxfZeroEntityMarkers(text);

if (entityMarkerCount < 10) {
  fail('DXF entity/group marker count looks too low.', {
    file,
    bytes: stat.size,
    entityMarkerCount,
  });
}

pass({
  file,
  bytes: stat.size,
  ascii: true,
  entityMarkerCount,
});
