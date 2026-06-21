import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkbenchModel,
  toUxmlXml,
} from '../vendor/pipe-component-data/src/index.js';

const CSV_FIXTURE = `id,type,name,nps,1x,1y,1z,2x,2y,2z,x,y,z
P1,PIPE,Pipe 1,4,0,0,0,1000,0,0,,,
S1,SUPPORT,Guide support,,,,,,,,500,0,0
`;

function assertWorkbenchCounts(model) {
  assert.equal(model.schema, 'piping-adapter-workbench/v1');
  assert.equal(model.counts.components, 2);
  assert.equal(model.counts.anchors, 3);
  assert.equal(model.counts.ports, 3);
  assert.equal(model.counts.segments, 2);
  assert.equal(model.counts.supports, 1);
  assert.equal(model.labels.componentCount, '2 components');
  assert.equal(model.labels.diagnosticCount, `${model.counts.diagnostics} diagnostics`);
}

test('public Workbench model parses CSV into graph counts and labels', () => {
  const model = createWorkbenchModel(CSV_FIXTURE, { importSessionId: 'phase7-csv' });
  assertWorkbenchCounts(model);

  assert.equal(model.graph.components[0].id, 'P1');
  assert.equal(model.graph.components[0].type, 'PIPE');
  assert.equal(model.graph.components[1].id, 'S1');
  assert.equal(model.graph.components[1].type, 'SUPPORT');
  assert.equal(model.graph.supports[0].componentId, 'S1');
  assert.equal(typeof model.actions.roundTrip, 'function');
  assert.match(model.actions.roundTrip().label, /^(passed|failed)$/);
});

test('public Workbench model parses UXML produced from the same public graph contract', () => {
  const csvModel = createWorkbenchModel(CSV_FIXTURE, { importSessionId: 'phase7-source' });
  const xml = toUxmlXml(csvModel.graph);
  const uxmlModel = createWorkbenchModel(xml, { importSessionId: 'phase7-uxml' });

  assertWorkbenchCounts(uxmlModel);
  assert.deepEqual(
    uxmlModel.graph.components.map((component) => component.id).sort(),
    ['P1', 'S1'],
  );
  assert.deepEqual(
    uxmlModel.graph.anchors.map((anchor) => anchor.point.x).sort((a, b) => a - b),
    [0, 500, 1000],
  );
});

test('public Workbench model aggregates graph and component diagnostics', () => {
  const model = createWorkbenchModel('id,type,name\nU1,,\n');

  assert.equal(model.schema, 'piping-adapter-workbench/v1');
  assert.equal(model.counts.components, 1);
  assert.ok(model.counts.diagnostics >= 2, 'graph-level and component-level diagnostics are counted');
  assert.equal(model.graph.components[0].confidence, 'UNRESOLVED');
  assert.ok(model.graph.components[0].diagnostics.some((diagnostic) => diagnostic.code === 'UNKNOWN_COMPONENT_TYPE'));
  assert.ok(model.graph.diagnostics.some((diagnostic) => diagnostic.code === 'CSV_ROW_MISSING_TYPE_HINT'));
});
