import test from 'node:test';
import assert from 'node:assert/strict';
import { BM1_CSV_REPLAY_FIXTURE } from '../benchmarks/bm1-csv-replay.fixture.js';
import { BENCHMARK_CSV_SCHEMA_VERSION, csvRowsToMacroScript, executeBenchmarkCsvReplay, parseBenchmarkCsv } from '../benchmarks/benchmark-csv-replay.js';
import { createRouteEngine } from '../editor/route-engine.js';

function componentTypes(routeEngine) {
  return (routeEngine.getState().model?.components || []).map((component) => component.type).sort();
}

function componentByType(routeEngine, type) {
  return (routeEngine.getState().model?.components || []).find((component) => component.type === type) || null;
}

test('BM1 CSV replay parses table rows and emits macro script rows', () => {
  const rows = parseBenchmarkCsv(BM1_CSV_REPLAY_FIXTURE);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].command, 'POLYLINE');
  assert.equal(rows[0].routeId, 'BM1-MAIN');

  const macroScript = csvRowsToMacroScript(BM1_CSV_REPLAY_FIXTURE);
  assert.match(macroScript, /AUTO_BEND ROUTE=BM1-MAIN/);
  assert.match(macroScript, /FLANGE_PAIR 1000,1000,0 ROUTE=BM1-MAIN/);
  assert.match(macroScript, /AUTO_TEE ROUTE=BM1-MAIN/);
  assert.match(macroScript, /SUPPORT_ATTACH 1000,3500,1250 ROUTE=BM1-BRANCH/);
});

test('BM1 CSV replay drives route engine and macro services without geometry duplication', () => {
  const routeEngine = createRouteEngine();
  const replay = executeBenchmarkCsvReplay(BM1_CSV_REPLAY_FIXTURE, { getRouteEngine: () => routeEngine }, { sourceName: 'bm1-csv-replay' });

  assert.equal(replay.schemaVersion, BENCHMARK_CSV_SCHEMA_VERSION);
  assert.equal(replay.ok, true);
  assert.equal(replay.routedRows, 2);
  assert.equal(replay.macroRows, 4);
  assert.equal(replay.macroReport.ok, true);

  const routes = routeEngine.getRoutes();
  assert.equal(routes.length, 2);
  assert.equal(routes[0].id, 'BM1-MAIN');
  assert.equal(routes[1].id, 'BM1-BRANCH');
  assert.equal(routes[0].nodes.length, 5);
  assert.equal(routes[1].nodes.length, 4);

  assert.deepEqual(componentTypes(routeEngine), ['ELBOW', 'FLANGE_PAIR', 'SUPPORT', 'TEE']);
  assert.equal(componentByType(routeEngine, 'ELBOW').attributes.PROVENANCE, 'BM1-CSV');
  assert.equal(componentByType(routeEngine, 'FLANGE_PAIR').id, 'FLG-001');
  assert.equal(componentByType(routeEngine, 'TEE').attributes.BRANCH_SIZE, '4IN');
  assert.equal(componentByType(routeEngine, 'SUPPORT').metadata.source.supportType, 'REST');
});
