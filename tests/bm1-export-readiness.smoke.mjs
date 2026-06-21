import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_EXPORT_READINESS_VERSION,
  BM1_EXPORT_TARGETS,
  assertBm1ExportReadiness,
  createBm1ExportReadinessReport,
} from '../benchmarks/bm1-export-readiness-report.js';
import './bm1-real-port-prerequisites.smoke.mjs';

test('BM1 export readiness report classifies centerline export targets', () => {
  const report = createBm1ExportReadinessReport();
  assert.equal(report.version, BM1_EXPORT_READINESS_VERSION);
  assert.equal(report.benchmarkId, 'BM1');
  assert.equal(report.canonicalSchemaVersion, 'bm-centerline-topology/v1');
  assert.equal(report.acceptanceOk, true);
  assert.deepEqual(Object.keys(report.targets), [...BM1_EXPORT_TARGETS]);

  assert.equal(report.targets.DXF_CENTERLINE.status, 'READY');
  assert.equal(report.targets.GLB_CENTERLINE.status, 'READY');
  assert.equal(report.targets.RVM_CENTERLINE.status, 'READY');
  assert.equal(report.targets.ATT_METADATA.status, 'READY');
  assert.equal(report.targets.FABRICATION_REAL_PORTS.status, 'DEFERRED');
  assert.equal(report.summary.errorCount, 0);
  assert.equal(assertBm1ExportReadiness(report), true);
});

test('BM1 export readiness reports real-port fabrication blockers as warnings only', () => {
  const report = createBm1ExportReadinessReport();
  const codes = report.diagnostics.map((item) => item.code).sort();
  assert.ok(codes.includes('BM1_EXPORT_REAL_PORTS_DEFERRED'));
  assert.ok(codes.includes('BM1_EXPORT_TEE_SOLID_TRIM_DEFERRED'));
  assert.ok(codes.includes('BM1_EXPORT_BEND_RADIUS_DEFERRED'));
  assert.ok(report.diagnostics.every((item) => item.severity === 'WARNING'));
});

test('BM1 export readiness does not invent fabricated dimensions', () => {
  const report = createBm1ExportReadinessReport();
  const serialized = JSON.stringify(report);
  for (const forbidden of ['gasketThickness', 'boltCount', 'faceToFace', 'portOffset', 'fabricatedLength', 'trimmedSolid']) {
    assert.equal(serialized.includes(forbidden), false, `BM1 export readiness must not invent ${forbidden}`);
  }
});

test('BM1 export readiness stays browser-independent and renderer-independent', () => {
  const source = readFileSync('benchmarks/bm1-export-readiness-report.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'querySelector', 'addEventListener', 'Blob', 'URL.createObjectURL', 'SceneRenderer', 'three']) {
    assert.equal(source.includes(forbidden), false, `BM1 export readiness must not depend on ${forbidden}`);
  }
});
