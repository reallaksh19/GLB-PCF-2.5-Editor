import assert from 'node:assert/strict';
import { createRawDxfModel, addBlockDefinition, addInsert } from '../formats/dxf/dxf-raw-model.js';
import { expandAllInserts } from '../formats/dxf/dxf-block-expander.js';
import { dxfToCeg } from '../formats/dxf/dxf-to-ceg.js';
import { graphToGenericComponents } from '../core/geometry/geometry-view.js';

const model = createRawDxfModel();
addBlockDefinition(model, 'VALVE_BLOCK', {
  basePoint: { x: 10, y: 0, z: 0 },
  entities: [
    {
      type: 'LINE',
      handle: 'B-L1',
      layer: '0',
      vertices: [
        { x: 10, y: 0, z: 0 },
        { x: 110, y: 0, z: 0 },
      ],
    },
    {
      type: 'CIRCLE',
      handle: 'B-C1',
      layer: 'SYMBOL',
      center: { x: 60, y: 0, z: 0 },
      radius: 25,
    },
  ],
});
addInsert(model, {
  type: 'INSERT',
  handle: 'I1',
  layer: 'PIPE-SYM',
  blockName: 'VALVE_BLOCK',
  position: { x: 1000, y: 2000, z: 0 },
  x: 1000,
  y: 2000,
  z: 0,
  rotation: 90,
  xScale: 2,
  yScale: 2,
  zScale: 1,
});

const expansion = expandAllInserts(model);
assert.equal(expansion.insertCount, 1);
assert.equal(expansion.missing, 0);
assert.equal(expansion.expanded, 2);
assert.equal(model.lines.length, 1, 'block LINE child must expand into raw lines');
assert.equal(model.circles.length, 1, 'block CIRCLE child must expand into raw circles');
assert.equal(model.blockExpansions.length, 1);

const expansion2 = expandAllInserts(model);
assert.equal(expansion2.skipped, true, 'second expansion must be guarded');
assert.equal(expansion2.reason, 'ALREADY_EXPANDED');
assert.equal(model.lines.length, 1, 'second expansion must not duplicate LINE child');
assert.equal(model.circles.length, 1, 'second expansion must not duplicate CIRCLE child');
assert.equal(model.blockExpansions.length, 1, 'second expansion must not duplicate expansion records');

const line = model.lines[0];
assert.equal(line.sourceRef.expandedFromInsert, 'I1');
assert.equal(line.sourceRef.blockName, 'VALVE_BLOCK');
assert.equal(line.sourceRef.childHandle, 'B-L1');
assert.equal(line.layer, 'PIPE-SYM', 'child layer 0 must inherit INSERT layer');
assert.ok(Math.abs(line.x1 - 1000) < 1e-9);
assert.ok(Math.abs(line.y1 - 2000) < 1e-9);
assert.ok(Math.abs(line.x2 - 1000) < 1e-9);
assert.ok(Math.abs(line.y2 - 2200) < 1e-9, `expected transformed y2 2200, got ${line.y2}`);

const ceg = dxfToCeg(model);
const generic = graphToGenericComponents(ceg);
const expandedLine = generic.find((comp) => comp.metadata.source.expandedFromInsert === 'I1' && comp.metadata.source.childHandle === 'B-L1');
const expandedCircle = generic.find((comp) => comp.metadata.source.expandedFromInsert === 'I1' && comp.metadata.source.childHandle === 'B-C1');

assert.ok(expandedLine, 'expanded block line must survive CEG projection with provenance');
assert.ok(expandedCircle, 'expanded block circle must survive CEG projection with provenance');
assert.equal(expandedCircle.geometry.closed, true, 'expanded block circle must render as closed curve');
assert.equal(ceg.diagnostics.some((diag) => diag.code === 'DXF_BLOCK_EXPANDED'), true);

console.log('DXF block expansion smoke passed', {
  expanded: expansion.expanded,
  components: generic.length,
  diagnostics: ceg.diagnostics.length,
});
