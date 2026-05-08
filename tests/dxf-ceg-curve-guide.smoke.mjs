import assert from 'node:assert/strict';
import { dxfToCeg } from '../formats/dxf/dxf-to-ceg.js';
import { graphToGenericComponents } from '../core/geometry/geometry-view.js';

const ceg = dxfToCeg({
  lines: [],
  arcs: [{
    type: 'ARC',
    handle: 'A1',
    layer: 'CURVE',
    cx: 0,
    cy: 0,
    cz: 0,
    radius: 100,
    startAngle: 0,
    endAngle: Math.PI / 2,
  }],
  circles: [{
    type: 'CIRCLE',
    handle: 'C1',
    layer: 'CIRCLE',
    cx: 500,
    cy: 500,
    cz: 0,
    radius: 250,
  }],
  polylines: [{
    type: 'LWPOLYLINE',
    handle: 'P1',
    layer: 'BULGE',
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 1 },
      { x: 100, y: 0, z: 0 },
    ],
  }],
  guides: [{
    type: 'SPLINE',
    handle: 'S1',
    layer: 'GUIDE',
    sourcePointType: 'CONTROL',
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 100, z: 0 },
      { x: 100, y: 0, z: 0 },
    ],
  }],
  texts: [],
  inserts: [],
  unsupported: [],
});

const comps = Object.values(ceg.components);
const arcs = comps.filter((comp) => comp.type === 'ARC');
const guides = comps.filter((comp) => comp.type === 'GUIDE');

assert.equal(arcs.length, 3, 'ARC entity + CIRCLE closed arc + bulged polyline arc expected');
assert.equal(guides.length, 1, 'SPLINE must become one GUIDE component, not pipe/line');
assert.ok(arcs.some((comp) => comp.sourceRef.entityType === 'CIRCLE' && comp.derived.closed === true), 'CIRCLE must be represented as closed curve');
assert.ok(arcs.some((comp) => comp.sourceRef.downgradedFrom === 'LWPOLYLINE' && comp.derived.bulge === 1), 'bulged polyline span must keep bulge metadata');
assert.equal(guides[0].anchorIds.length, 3, 'SPLINE guide must preserve control/fitting points');

const generic = graphToGenericComponents(ceg);
const genericCircle = generic.find((comp) => comp.metadata.source.entityType === 'CIRCLE');
const genericBulge = generic.find((comp) => comp.metadata.source.downgradedFrom === 'LWPOLYLINE');
const genericGuide = generic.find((comp) => comp.type === 'GUIDE');

assert.equal(genericCircle.geometry.closed, true, 'derived geometry must expose closed circle flag');
assert.equal(genericCircle.geometry.radius, 250, 'derived circle radius must be preserved');
assert.equal(genericBulge.geometry.bulge, 1, 'derived bulge metadata must be preserved');
assert.equal(genericGuide.geometry.points.length, 3, 'derived guide points must be exposed for spline rendering');

console.log('DXF CEG curve/guide smoke passed', {
  arcs: arcs.length,
  guides: guides.length,
  generic: generic.length,
});
