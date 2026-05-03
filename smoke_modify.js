import { createRouteEngine, registerDefaultRouteHandlers } from './editor/route-engine.js';
import { COMMAND_CONTRACT_VERSION } from './editor/command-types.js';

console.log("SMOKE: Testing modify tools logic");

registerDefaultRouteHandlers();
const engine = createRouteEngine({});

console.log("-> Create Route");
engine.startRoute({x: 0, y: 0, z: 0}, { size: "100" });
engine.addSegment({ dx: 100, dy: 0, dz: 0 });
engine.addSegment({ dx: 0, dy: 100, dz: 0 });

const route = engine.getActiveRoute();
console.log("Route segments:", route.segments.length, "Nodes:", route.nodes.length);

console.log("-> Stretch Node");
const nodeToStretch = route.nodes[1].id;
engine.stretchNode(route.id, nodeToStretch, { dx: 50, dy: 0, dz: 0 });
console.log("Node 1 stretched to:", engine.getActiveRoute().nodes[1]);

console.log("-> Rotate Node");
engine.rotateNodes(route.id, { x: 0, y: 0, z: 0 }, 90, 'Z');
const rotatedNode = engine.getActiveRoute().nodes[1];
console.log("Node 1 rotated to:", { x: rotatedNode.x.toFixed(2), y: rotatedNode.y.toFixed(2), z: rotatedNode.z.toFixed(2) });

console.log("-> Break Segment");
const segToBreak = route.segments[0].id;
engine.breakSegment(route.id, segToBreak);
console.log("Route segments after break:", engine.getActiveRoute().segments.length, "Nodes:", engine.getActiveRoute().nodes.length);

console.log("-> Polyline Create");
engine.createPolyline([{x: 10, y: 10, z: 0}, {x: 20, y: 20, z: 0}, {x: 30, y: 20, z: 0}]);
console.log("Total routes:", engine.getRoutes().length);
console.log("Polyline nodes:", engine.getActiveRoute().nodes.length, "Segments:", engine.getActiveRoute().segments.length);

console.log("-> Spline Guide Create");
const guideId = engine.createGuide([{x: 1, y: 1, z: 1}, {x: 2, y: 2, z: 2}], 'SPLINE');
console.log("Guide created:", guideId);
console.log("Guides count:", engine.getState().model.guides.length);

console.log("Modify smoke test finished.");
