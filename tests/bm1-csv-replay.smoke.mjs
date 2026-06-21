import test from 'node:test';
import assert from 'node:assert/strict';
import { BM1_CSV_REPLAY_FIXTURE } from '../benchmarks/bm1-csv-replay.fixture.js';
import { BENCHMARK_CSV_SCHEMA_VERSION, csvRowsToMacroScript, executeBenchmarkRows, parseBenchmarkCsv } from '../benchmarks/benchmark-csv-replay.js';
import { createRouteEngine } from '../editor/route-engine.js';

function routeRowsOnly(rows) {
  return rows.filter((row) => String(row.command || '').toUpperCase() === 'POLYLINE');
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

test('BM1 CSV replay executes route rows through the route engine without geometry duplication', () => {
  const rows = parseBenchmarkCsv(BM1_CSV_REPLAY_FIXTURE);
  const routeEngine = createRouteEngine();
  const replay = executeBenchmarkRows(routeRowsOnly(rows), { getRouteEngine: () => routeEngine }, { sourceName: 'bm1-csv-replay-routes' });

  assert.equal(replay.schemaVersion, BENCHMARK_CSV_SCHEMA_VERSION);
  assert.equal(replay.ok, true);
  assert.equal(replay.routedRows, 2);
  assert.equal(replay.macroRows, 0);
  assert.equal(replay.macroScript, '');

  const routes = routeEngine.getRoutes();
  assert.equal(routes.length, 2);
  assert.equal(routes[0].id, 'BM1-MAIN');
  assert.equal(routes[1].id, 'BM1-BRANCH');
  assert.equal(routes[0].nodes.length, 5);
  assert.equal(routes[1].nodes.length, 4);
});
