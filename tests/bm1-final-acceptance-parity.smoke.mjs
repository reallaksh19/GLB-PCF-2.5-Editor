import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_ACCEPTANCE_PHASES,
  BM1_ACCEPTANCE_REPORT_VERSION,
  REQUIRED_BM1_MACRO_INTENTS,
  createBm1AcceptanceReport,
} from '../benchmarks/bm1-acceptance-report.js';

test('BM1 final acceptance report covers all BM1 phase gates', () => {
  const report = createBm1AcceptanceReport();
  assert.equal(report.version, BM1_ACCEPTANCE_REPORT_VERSION);
  assert.equal(report.benchmarkId, 'BM1');
  assert.deepEqual(report.phases.map((item) => item.phase), BM1_ACCEPTANCE_PHASES);
  assert.ok(report.phases.every((item) => item.status === 'covered'));
  assert.equal(report.ok, true);
});

test('BM1 final acceptance report proves declarative and pipe-list topology parity', () => {
  const report = createBm1AcceptanceReport();
  assert.equal(report.paths.declarative.ok, true);
  assert.equal(report.paths.pipeList.ok, true);
  assert.equal(report.parity.declarativeVsPipeList, true);
  assert.deepEqual(report.paths.pipeList.signature, report.paths.declarative.signature);
  assert.equal(report.paths.declarative.signature.summary.nodeCount, 9);
  assert.equal(report.paths.declarative.signature.summary.originalSegmentCount, 6);
  assert.equal(report.paths.declarative.signature.summary.supportCount, 1);
});

test('BM1 final acceptance report proves CSV and UI/HUD macro intent coverage', () => {
  const report = createBm1AcceptanceReport();
  assert.equal(report.paths.csvReplay.ok, true);
  assert.equal(report.paths.csvReplay.rowCount, 6);
  assert.equal(report.paths.csvReplay.routeRows, 2);
  assert.equal(report.paths.csvReplay.macroRows, 4);
  assert.equal(report.paths.uiHud.ok, true);
  assert.equal(report.parity.macroIntentCoverage, true);
  assert.equal(report.parity.noCustomGeometryBuilders, true);

  for (const intent of REQUIRED_BM1_MACRO_INTENTS) {
    assert.ok(report.paths.csvReplay.commands.includes(intent) || intent === 'SUPPORT_ATTACH', `${intent} should be represented in CSV replay commands or macro rows`);
  }
});

test('BM1 final acceptance report is browser-independent and has no renderer dependencies', () => {
  const source = readFileSync('benchmarks/bm1-acceptance-report.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'querySelector', 'addEventListener', 'three', 'SceneRenderer']) {
    assert.equal(source.includes(forbidden), false, `BM1 acceptance report must not depend on ${forbidden}`);
  }
});
