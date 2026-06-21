import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BM1_CENTERLINE_FIXTURE } from '../benchmarks/bm1-centerline.fixture.js';
import { BM1_PIPE_LIST_FIXTURE } from '../benchmarks/bm1-pipe-list.fixture.js';
import { normalizeBenchmark } from '../benchmarks/benchmark-normalizer.js';
import { normalizePipeListBenchmark, PIPE_LIST_DIAGNOSTIC_CODES } from '../benchmarks/benchmark-pipe-list-normalizer.js';

const EPS = 0.001;

function assertNear(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= EPS, `${label}: expected ${expected}, received ${actual}`);
}

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function canonicalSegments(canonical) {
  return canonical.segments.map((segment) => ({ id: segment.id, from: segment.from, to: segment.to, spec: segment.spec, orientation: segment.orientation, lengthMm: segment.lengthMm })).sort(byItemId);
}

function canonicalFeatures(canonical) {
  return canonical.features.map((feature) => ({ ...feature })).sort(byItemId);
}

function canonicalSupports(canonical) {
  return canonical.supports.map((support) => ({ ...support })).sort(byItemId);
}

function splitSignature(canonical) {
  return canonical.derivedSplits.map((split) => ({ segmentId: split.segmentId, atNode: split.atNode, spans: split.spans.map((span) => ({ from: span.from, to: span.to, lengthMm: span.lengthMm })) })).sort((a, b) => a.segmentId.localeCompare(b.segmentId));
}

function byItemId(a, b) {
  return a.id.localeCompare(b.id);
}

function assertEquivalentTopology(left, right) {
  assert.equal(right.schemaVersion, left.schemaVersion);
  assert.equal(right.mode, left.mode);
  assert.equal(right.units, left.units);
  assert.equal(right.summary.nodeCount, left.summary.nodeCount);
  assert.equal(right.summary.originalSegmentCount, left.summary.originalSegmentCount);
  assert.deepEqual(right.summary.featureCounts, left.summary.featureCounts);
  assert.equal(right.summary.supportCount, left.summary.supportCount);

  const leftNodes = byId(left.nodes);
  const rightNodes = byId(right.nodes);
  assert.deepEqual([...rightNodes.keys()].sort(), [...leftNodes.keys()].sort());
  for (const [id, leftNode] of leftNodes) {
    const rightNode = rightNodes.get(id);
    assertNear(rightNode.x, leftNode.x, `${id}.x`);
    assertNear(rightNode.y, leftNode.y, `${id}.y`);
    assertNear(rightNode.z, leftNode.z, `${id}.z`);
  }

  const leftSegments = canonicalSegments(left);
  const rightSegments = canonicalSegments(right);
  assert.deepEqual(rightSegments.map(withoutLength), leftSegments.map(withoutLength));
  rightSegments.forEach((segment, index) => assertNear(segment.lengthMm, leftSegments[index].lengthMm, `${segment.id} length`));
  assert.deepEqual(canonicalFeatures(right), canonicalFeatures(left));
  assert.deepEqual(canonicalSupports(right), canonicalSupports(left));

  const leftSplits = splitSignature(left);
  const rightSplits = splitSignature(right);
  assert.deepEqual(rightSplits.map(withoutSplitLengths), leftSplits.map(withoutSplitLengths));
  for (const [splitIndex, split] of rightSplits.entries()) {
    split.spans.forEach((span, spanIndex) => assertNear(span.lengthMm, leftSplits[splitIndex].spans[spanIndex].lengthMm, `${split.segmentId}.${span.from}-${span.to}`));
  }
}

function withoutLength(segment) {
  const { lengthMm, ...rest } = segment;
  return rest;
}

function withoutSplitLengths(split) {
  return { ...split, spans: split.spans.map(({ lengthMm, ...span }) => span) };
}

function withMutatedEndpoint(fixture, pipeId, endpoint, patch) {
  return {
    ...fixture,
    pipes: fixture.pipes.map((pipe) => pipe.id === pipeId ? { ...pipe, [endpoint]: { ...pipe[endpoint], ...patch } } : pipe),
  };
}

test('BM1 explicit pipe-list path normalizes to the declarative BM1 topology', () => {
  const declarative = normalizeBenchmark(BM1_CENTERLINE_FIXTURE);
  const pipeList = normalizePipeListBenchmark(BM1_PIPE_LIST_FIXTURE);

  assert.equal(pipeList.sourceSchemaVersion, 'bm-explicit-pipe-list/v1');
  assert.equal(pipeList.canonical.id, 'BM1');
  assert.equal(pipeList.canonical.summary.structuralValid, true);
  assert.deepEqual(pipeList.canonical.diagnostics, []);
  assert.ok(pipeList.pipeListDiagnostics.every((diagnostic) => diagnostic.severity !== 'ERROR'));
  assertEquivalentTopology(declarative, pipeList.canonical);
});

test('pipe-list duplicate endpoint coordinates snap only through the explicit tolerance policy', () => {
  const near = withMutatedEndpoint(BM1_PIPE_LIST_FIXTURE, 'P2', 'from', { y: 1000.0005 });
  const nearResult = normalizePipeListBenchmark(near);
  assert.ok(nearResult.pipeListDiagnostics.some((diagnostic) => diagnostic.code === PIPE_LIST_DIAGNOSTIC_CODES.duplicatePointIdSnapped));
  assert.ok(nearResult.pipeListDiagnostics.every((diagnostic) => diagnostic.severity !== 'ERROR'));

  const conflict = withMutatedEndpoint(BM1_PIPE_LIST_FIXTURE, 'P2', 'from', { y: 1000.1 });
  const conflictResult = normalizePipeListBenchmark(conflict);
  assert.ok(conflictResult.pipeListDiagnostics.some((diagnostic) => diagnostic.code === PIPE_LIST_DIAGNOSTIC_CODES.duplicatePointIdConflict));
  assert.ok(conflictResult.pipeListDiagnostics.some((diagnostic) => diagnostic.severity === 'ERROR'));
});

test('pipe-list normalizer remains browser-independent and geometry-service ready', () => {
  const source = readFileSync('benchmarks/benchmark-pipe-list-normalizer.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'canvas', 'three']) {
    assert.equal(source.includes(forbidden), false, `pipe-list normalizer must not depend on ${forbidden}`);
  }
});
