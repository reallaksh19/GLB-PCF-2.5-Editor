import assert from 'assert/strict';
import { createCanonicalEditGraph } from '../../../core/ceg/canonical-edit-graph.js';
import { createComponent } from '../../../core/ceg/canonical-component.js';
import { createAnchor } from '../../../core/ceg/canonical-anchor.js';
import { dispatchCommand } from '../../../core/commands/command-dispatcher.js';
import { CommandType } from '../../../core/commands/command-types.js';

// Initialise graph with a simple line and block
let graph = createCanonicalEditGraph();
graph.components['line_001'] = createComponent({ id: 'line_001', type: 'LINE', anchorIds: ['a1','a2'], geometryRole: 'LINEAR' });
graph.components['block_001'] = createComponent({ id: 'block_001', type: 'BLOCK_COMPONENT', anchorIds: ['a3'], geometryRole: 'POINT' });
graph.anchors['a1'] = createAnchor({ id: 'a1', role: 'EP1', point: { x: 0, y: 0, z: 0 } });
graph.anchors['a2'] = createAnchor({ id: 'a2', role: 'EP2', point: { x: 4200, y: 0, z: 0 } });
graph.anchors['a3'] = createAnchor({ id: 'a3', role: 'ORIGIN', point: { x: 1000, y: 1000, z: 0 } });

// Move the line by +1000 mm in X
graph = dispatchCommand(graph, {
  type: CommandType.MOVE_COMPONENTS,
  selection: ['line_001'],
  payload: { delta: { x: 1000, y: 0, z: 0 } },
  timestamp: 1
});
assert.equal(graph.anchors['a1'].point.x, 1000);
assert.equal(graph.anchors['a2'].point.x, 5200);

// Extend the line to 5000 mm (endpoint a2)
graph = dispatchCommand(graph, {
  type: CommandType.EXTEND_LINEAR,
  payload: { componentId: 'line_001', endpoint: 'a2', newLength: 5000 },
  timestamp: 2
});
assert.equal(Math.round(graph.anchors['a2'].point.x), 6000);

// Stretch endpoint a2 down by 1200 mm in Z
graph = dispatchCommand(graph, {
  type: CommandType.STRETCH_ANCHORS,
  payload: { anchors: ['a2'], delta: { x: 0, y: 0, z: -1200 } },
  timestamp: 3
});
assert.equal(graph.anchors['a2'].point.z, -1200);

// Delete the block
graph = dispatchCommand(graph, {
  type: CommandType.DELETE_COMPONENTS,
  selection: ['block_001'],
  timestamp: 4
});
assert.ok(!graph.components['block_001']);
assert.ok(!graph.anchors['a3']);