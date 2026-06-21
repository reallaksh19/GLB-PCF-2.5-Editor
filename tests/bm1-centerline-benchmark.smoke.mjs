import test from 'node:test';
import assert from 'node:assert/strict';
import { BM1_CENTERLINE_FIXTURE } from '../benchmarks/bm1-centerline.fixture.js';
import { BENCHMARK_SCHEMA_VERSION, normalizeBenchmark } from '../benchmarks/benchmark-normalizer.js';
import { BENCHMARK_PCD_DIAGNOSTIC_CODES, collectBenchmarkPcdDiagnostics } from '../benchmarks/benchmark-pcd-diagnostics.js';

const EPS = 0.001;

function byId(items, id) {
  return items.find((item) => item.id === id);
}

function splitBySegment(canonical, segmentId) {
  return canonical.derivedSplits.find((split) => split.segmentId === segmentId);
}

function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= EPS, `${message}: expected ${expected}, received ${actual}`);
}

function assertNoFabricatedDimensions(value) {
  const blockedKeys = new Set(['dimensions', 'odMm', 'wallMm', 'boreMm', 'flangeThicknessMm', 'centerlineRadiusMm', 'faceToFaceMm', 'developedLengthMm', 'weightKg']);
  visit(value, (key) => assert.ok(!blockedKeys.has(key), `fabricated/catalog dimension key leaked into canonical benchmark model: ${key}`));
}

function visit(value, onKey) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    onKey(key);
    visit(child, onKey);
  }
}

test('BM1 centerline fixture normalizes into the canonical topology contract', () => {
  const canonical = normalizeBenchmark(BM1_CENTERLINE_FIXTURE);

  assert.equal(canonical.id, 'BM1');
  assert.equal(canonical.schemaVersion, BENCHMARK_SCHEMA_VERSION);
  assert.equal(canonical.mode, 'CENTERLINE');
  assert.equal(canonical.units, 'MM');
  assert.equal(canonical.summary.structuralValid, true);
  assert.deepEqual(canonical.diagnostics, []);

  assert.equal(canonical.summary.nodeCount, 9);
  assert.equal(canonical.summary.originalSegmentCount, 6);
  assert.equal(canonical.summary.supportCount, 1);
  assert.equal(canonical.summary.featureCounts.AUTO_BEND_CANDIDATE, 1);
  assert.equal(canonical.summary.featureCounts.FLANGE_PAIR, 1);
  assert.equal(canonical.summary.featureCounts.AUTO_TEE_CANDIDATE, 1);
  assert.equal(canonical.summary.featureCounts.BREAK, 2);

  const support = byId(canonical.supports, 'PS-001');
  assert.equal(support.supportType, 'REST');
  assert.equal(support.at, 'S');

  assert.equal(byId(canonical.features, 'BRK-001').onSegment, 'P3');
  assert.equal(byId(canonical.features, 'BRK-002').onSegment, 'P6');
  assertNear(byId(canonical.segments, 'P3').lengthMm, 1200, 'P3 length');
  assertNear(byId(canonical.segments, 'P4').lengthMm, 1300, 'P4 length');
  assertNear(byId(canonical.segments, 'P6').lengthMm, 860, 'F-G branch length');

  const tee = byId(canonical.features, 'TEE-001');
  assert.equal(tee.at, 'E');
  assert.equal(tee.runSpec, 'MAIN');
  assert.equal(tee.branchSpec, 'BRANCH');

  const p3Split = splitBySegment(canonical, 'P3');
  assert.deepEqual(p3Split.spans.map((span) => span.from), ['C', 'M']);
  assert.deepEqual(p3Split.spans.map((span) => span.to), ['M', 'D']);
  assertNear(p3Split.spans[0].lengthMm, 600, 'P3 C-M split length');
  assertNear(p3Split.spans[1].lengthMm, 600, 'P3 M-D split length');

  const p6Split = splitBySegment(canonical, 'P6');
  assert.deepEqual(p6Split.spans.map((span) => span.from), ['F', 'S']);
  assert.deepEqual(p6Split.spans.map((span) => span.to), ['S', 'G']);
  assertNear(p6Split.spans[0].lengthMm, 550, 'P6 F-S split length');
  assertNear(p6Split.spans[1].lengthMm, 310, 'P6 S-G split length');

  assertNoFabricatedDimensions(canonical);
});

test('BM1 PCD lookup gaps are warnings outside structural topology validity', () => {
  const canonical = normalizeBenchmark(BM1_CENTERLINE_FIXTURE);
  const catalog = collectBenchmarkPcdDiagnostics(canonical);
  const messages = catalog.diagnostics.map((diagnostic) => diagnostic.message);

  assert.equal(canonical.summary.structuralValid, true);
  assert.ok(catalog.diagnostics.length >= 4, 'expected unresolved BM1 catalog rows to be reported');
  assert.ok(catalog.diagnostics.every((diagnostic) => diagnostic.severity === 'WARNING'));
  assert.ok(catalog.diagnostics.every((diagnostic) => diagnostic.code === BENCHMARK_PCD_DIAGNOSTIC_CODES.catalogRowMissing));

  assert.ok(messages.some((message) => message.includes('MAIN pipe 150NB SCH40')));
  assert.ok(messages.some((message) => message.includes('MAIN flange WN RF CLASS300 150NB')));
  assert.ok(messages.some((message) => message.includes('MAIN elbow 150NB SCH40 ELBOW_90_LR')));
  assert.ok(messages.some((message) => message.includes('MAIN × BRANCH reducing tee 150NB × 4IN SCH40')));
  assertNoFabricatedDimensions(catalog);
});
