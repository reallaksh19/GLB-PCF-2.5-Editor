import assert from 'node:assert/strict';
import { createCanonicalEditGraph } from '../core/ceg/canonical-edit-graph.js';
import { createAnchor } from '../core/ceg/canonical-anchor.js';
import { createComponent } from '../core/ceg/canonical-component.js';
import { graphToGenericComponents } from '../core/geometry/geometry-view.js';

const graph = createCanonicalEditGraph({ sourceFormat: 'TEST', name: 'geometry-view-smoke' });

graph.anchors.a1 = createAnchor({ id: 'a1', role: 'EP1', point: { x: 0, y: 0, z: 0 } });
graph.anchors.a2 = createAnchor({ id: 'a2', role: 'EP2', point: { x: 1000, y: 0, z: 0 } });
graph.components.c1 = createComponent({
  id: 'c1',
  type: 'PIPE',
  anchorIds: ['a1', 'a2'],
  geometryRole: 'LINEAR',
  attributes: { BORE: '100' },
});

graph.anchors.t1 = createAnchor({ id: 't1', role: 'RUN_IN', point: { x: 0, y: 0, z: 0 } });
graph.anchors.t2 = createAnchor({ id: 't2', role: 'RUN_OUT', point: { x: 1000, y: 0, z: 0 } });
graph.anchors.t3 = createAnchor({ id: 't3', role: 'BRANCH_OUT', point: { x: 1000, y: 500, z: 0 } });
graph.components.c2 = createComponent({
  id: 'c2',
  type: 'TEE',
  anchorIds: ['t1', 't2', 't3'],
  geometryRole: 'BRANCH',
  attributes: { BORE: '150', 'BRANCH-BORE': '100' },
});

const derived = graphToGenericComponents(graph);
assert.equal(derived.length, 2, 'Expected two derived components');

const pipe = derived.find((comp) => comp.id === 'c1');
assert.ok(pipe, 'Missing derived pipe component');
assert.deepEqual(pipe.geometry.ep1, { x: 0, y: 0, z: 0 });
assert.deepEqual(pipe.geometry.ep2, { x: 1000, y: 0, z: 0 });
assert.equal(pipe.geometry.bore, 100);

const tee = derived.find((comp) => comp.id === 'c2');
assert.ok(tee, 'Missing derived tee component');
assert.deepEqual(tee.geometry.ep1, { x: 0, y: 0, z: 0 });
assert.deepEqual(tee.geometry.ep2, { x: 1000, y: 0, z: 0 });
assert.deepEqual(tee.geometry.bp, { x: 1000, y: 500, z: 0 });

console.log('Geometry view smoke passed', { componentCount: derived.length });
