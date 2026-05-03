import assert from 'assert/strict';
import { createCanonicalEditGraph, CEG_SCHEMA_VERSION } from '../../../core/ceg/canonical-edit-graph.js';
import { createComponent } from '../../../core/ceg/canonical-component.js';
import { createAnchor } from '../../../core/ceg/canonical-anchor.js';
import { hashCeg } from '../../../core/ceg/ceg-hash.js';

// Test empty graph creation
const graph = createCanonicalEditGraph();
assert.equal(graph.schemaVersion, CEG_SCHEMA_VERSION);
assert.ok(graph.components);
assert.ok(graph.anchors);
assert.ok(graph.topologyLinks);
assert.ok(graph.lossContract);

// Test deterministic hash
const hash1 = hashCeg(graph);
const hash2 = hashCeg(graph);
assert.equal(hash1, hash2);

// Add components and anchors
graph.components['c1'] = createComponent({ id: 'c1', type: 'LINE', anchorIds: ['a1','a2'], geometryRole: 'LINEAR' });
graph.anchors['a1'] = createAnchor({ id: 'a1', role: 'EP1', point: { x: 0, y: 0, z: 0 } });
graph.anchors['a2'] = createAnchor({ id: 'a2', role: 'EP2', point: { x: 1000, y: 0, z: 0 } });
assert.equal(Object.keys(graph.components).length, 1);
assert.equal(Object.keys(graph.anchors).length, 2);