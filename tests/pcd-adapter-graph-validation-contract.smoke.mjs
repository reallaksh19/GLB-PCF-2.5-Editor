import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADAPTER_GRAPH_KEYS,
  assertExactGraphKeySet,
  assertJsonSerializable,
  assertUniversalInvariants,
  fromCsv,
  fromUxmlXml,
  toUxmlXml,
} from '../vendor/pipe-component-data/src/index.js';

const CSV_FIXTURE = `id,type,name,nps,1x,1y,1z,2x,2y,2z,x,y,z
P1,PIPE,Pipe 1,4,0,0,0,1000,0,0,,,
S1,SUPPORT,Guide support,,,,,,,,500,0,0
`;

function validatePublicGraph(graph) {
  assertExactGraphKeySet(graph);
  assertJsonSerializable(graph);
  assertUniversalInvariants(graph);
}

test('public fromCsv graph satisfies exported adapter graph validation contract', () => {
  const graph = fromCsv(CSV_FIXTURE, { importSessionId: 'phase8-csv' });
  validatePublicGraph(graph);

  assert.deepEqual(Object.keys(graph).sort(), [...ADAPTER_GRAPH_KEYS].sort());
  assert.equal(graph.schemaVersion, 'piping-adapter-graph/v1');
  assert.equal(graph.components.length, 2);
  assert.equal(graph.anchors.length, 3);
  assert.equal(graph.ports.length, 3);
  assert.equal(graph.segments.length, 2);
  assert.equal(graph.supports.length, 1);
  assert.equal(graph.lossContract.length, 0);
});

test('public UXML round-trip graph satisfies the same validation contract', () => {
  const csvGraph = fromCsv(CSV_FIXTURE, { importSessionId: 'phase8-source' });
  const xml = toUxmlXml(csvGraph);
  const restored = fromUxmlXml(xml, { importSessionId: 'phase8-uxml' });

  validatePublicGraph(restored);
  assert.deepEqual(
    restored.components.map((component) => component.id).sort(),
    ['P1', 'S1'],
  );
  assert.deepEqual(
    restored.anchors.map((anchor) => anchor.point.x).sort((a, b) => a - b),
    [0, 500, 1000],
  );
});

test('public universal invariant rejects non-finite numeric graph values', () => {
  const graph = fromCsv(CSV_FIXTURE, { importSessionId: 'phase8-invalid' });
  const invalid = JSON.parse(JSON.stringify(graph));
  invalid.anchors[0].point.x = Number.POSITIVE_INFINITY;

  assert.throws(
    () => assertUniversalInvariants(invalid),
    /must be finite/,
  );
});

test('public exact key-set validator rejects extra top-level keys', () => {
  const graph = fromCsv(CSV_FIXTURE, { importSessionId: 'phase8-extra-key' });
  const invalid = { ...graph, unexpected: true };

  assert.throws(
    () => assertExactGraphKeySet(invalid),
    /AdapterGraph top-level key set mismatch/,
  );
});
