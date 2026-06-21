import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_REAL_PORT_PREREQUISITES_VERSION,
  BM1_REAL_PORT_REQUIREMENTS,
  assertBm1RealPortGeometryMustRemainBlocked,
  createBm1RealPortPrerequisiteReport,
} from '../benchmarks/bm1-real-port-prerequisites.js';

test('BM1 real-port prerequisite gate blocks fabrication geometry without exact catalog rows', () => {
  const report = createBm1RealPortPrerequisiteReport();
  assert.equal(report.version, BM1_REAL_PORT_PREREQUISITES_VERSION);
  assert.equal(report.benchmarkId, 'BM1');
  assert.equal(report.exportReadinessStatus, 'DEFERRED');
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.policy.geometryImplementationAllowed, false);
  assert.equal(assertBm1RealPortGeometryMustRemainBlocked(report), true);
});

test('BM1 real-port prerequisite gate lists required fabrication data without values', () => {
  const report = createBm1RealPortPrerequisiteReport();
  assert.deepEqual(report.requirements.map((item) => item.id), BM1_REAL_PORT_REQUIREMENTS.map((item) => item.id));
  for (const requirement of report.requirements) {
    assert.ok(requirement.requiredFields.length >= 4);
    assert.equal(requirement.status, 'BLOCKED');
    assert.equal(requirement.exactCatalogResolved, false);
  }
});

test('BM1 real-port prerequisite gate reports catalog blockers from PCD diagnostics', () => {
  const report = createBm1RealPortPrerequisiteReport();
  assert.ok(report.pcdSummary.lookupCount >= 4);
  assert.ok(report.pcdSummary.missingCount >= 1);
  assert.ok(report.missingCatalogTargets.some((item) => item.kind === 'FLANGE'));
  assert.ok(report.blockers.some((item) => item.code === 'BM1_REAL_PORT_CATALOG_ROW_MISSING'));
});

test('BM1 real-port prerequisite gate does not contain fabricated dimensions or renderer dependencies', () => {
  const report = createBm1RealPortPrerequisiteReport();
  const serialized = JSON.stringify(report);
  for (const forbidden of ['gasketThickness":', 'boltCount":', 'faceToFace":', 'portOffset":', 'fabricatedLength":', 'trimmedSolid":']) {
    assert.equal(serialized.includes(forbidden), false, `BM1 real-port prerequisite gate must not invent ${forbidden}`);
  }

  const source = readFileSync('benchmarks/bm1-real-port-prerequisites.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'querySelector', 'addEventListener', 'SceneRenderer', 'three', 'Blob', 'URL.createObjectURL']) {
    assert.equal(source.includes(forbidden), false, `BM1 real-port prerequisite gate must not depend on ${forbidden}`);
  }
});
