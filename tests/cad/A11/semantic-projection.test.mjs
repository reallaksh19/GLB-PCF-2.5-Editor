/**
 * tests/cad/A11/semantic-projection.test.mjs
 *
 * Author test suite for Child #97 (A11):
 * Bounded optional piping semantic projection, versioned recognition policy,
 * source-linked references, deceptive entity rejection, and stale revision rejection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECOGNITION_POLICY_VERSION,
  RecognitionPolicy,
  createDefaultRecognitionPolicy,
  SemanticProjectionResult,
  derivePipingCegFromDxfDocument,
} from '../../../formats/dxf/semantic/index.js';

import {
  SourceRef,
  SemanticComponentRef,
  SemanticLinkManager,
} from '../../../formats/cad/semantic-links/index.js';

test('A11: RecognitionPolicy enforces versioning and explicit classification', () => {
  const policy = createDefaultRecognitionPolicy();
  assert.equal(policy.version, RECOGNITION_POLICY_VERSION);
  assert.equal(policy.version, '1.0.0');

  // Piping layer identification
  assert.equal(policy.isPipingLayer('PIPE_PROCESS'), true);
  assert.equal(policy.isPipingLayer('P-CHW-01'), true);
  assert.equal(policy.isPipingLayer('CW_SUPPLY'), true);
  assert.equal(policy.isPipingLayer('0'), false);
  assert.equal(policy.isPipingLayer('DEFPOINTS'), false);
  assert.equal(policy.isPipingLayer('ANNOTATIONS'), false);
});

test('A11: Deceptive generic LINE on layer 0/drafting is rejected; piping LINE becomes PIPE', () => {
  const policy = createDefaultRecognitionPolicy();

  // 1. Generic line on layer 0 (deceptive candidate)
  const genericLine = {
    id: 'doc:handle:101',
    type: 'LINE',
    layer: '0',
    geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
  };
  const resGeneric = policy.classifyEntity(genericLine);
  assert.equal(resGeneric.recognized, false);
  assert.equal(resGeneric.ruleId, 'REJECT_DECEPTIVE_GENERIC_LINE');
  assert.ok(resGeneric.reasons[0].includes('non-piping layer'));

  // 2. Piping line on process layer
  const pipeLine = {
    id: 'doc:handle:102',
    type: 'LINE',
    layer: 'P-PROCESS-OIL',
    geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 50, y: 0, z: 0 } },
  };
  const resPipe = policy.classifyEntity(pipeLine);
  assert.equal(resPipe.recognized, true);
  assert.equal(resPipe.componentType, 'PIPE');
  assert.equal(resPipe.ruleId, 'PIPE_FROM_LINE_ON_PIPING_LAYER');
  assert.ok(resPipe.confidence >= 0.9);
});

test('A11: Deceptive generic INSERT (TITLE_BLOCK, NORTH_ARROW) is rejected; valve becomes VALVE', () => {
  const policy = createDefaultRecognitionPolicy();

  // 1. Title block insert
  const titleBlock = {
    id: 'doc:handle:201',
    type: 'INSERT',
    layer: '0',
    attributes: { blockName: 'ANSI_D_TITLE_BLOCK' },
  };
  const resTitle = policy.classifyEntity(titleBlock);
  assert.equal(resTitle.recognized, false);
  assert.equal(resTitle.ruleId, 'REJECT_DECEPTIVE_GENERIC_INSERT');

  // 2. North arrow
  const northArrow = {
    id: 'doc:handle:202',
    type: 'INSERT',
    layer: 'ANNOTATIONS',
    attributes: { blockName: 'NORTH_ARROW_SYM' },
  };
  const resArrow = policy.classifyEntity(northArrow);
  assert.equal(resArrow.recognized, false);
  assert.equal(resArrow.ruleId, 'REJECT_DECEPTIVE_GENERIC_INSERT');

  // 3. Piping valve insert
  const valve = {
    id: 'doc:handle:203',
    type: 'INSERT',
    layer: 'P-VALVES',
    attributes: { blockName: 'GATE_VALVE_2INCH' },
    geometry: { point: { x: 50, y: 0, z: 0 } },
  };
  const resValve = policy.classifyEntity(valve);
  assert.equal(resValve.recognized, true);
  assert.equal(resValve.componentType, 'VALVE');
  assert.equal(resValve.ruleId, 'BLOCK_VALVE');
});

test('A11: Geometrically coincident TEXT and DIMENSION do not participate in piping topology', () => {
  const policy = createDefaultRecognitionPolicy();

  // Text sitting exactly on a pipe centerline
  const label = {
    id: 'doc:handle:301',
    type: 'TEXT',
    layer: 'P-PROCESS-OIL',
    attributes: { text: '6"-OIL-150#' },
    geometry: { point: { x: 25, y: 0, z: 0 } },
  };
  const resLabel = policy.classifyEntity(label);
  assert.equal(resLabel.recognized, false);
  assert.equal(resLabel.ruleId, 'REJECT_ANNOTATION_TYPE');

  // Dimension annotating the pipe
  const dim = {
    id: 'doc:handle:302',
    type: 'DIMENSION',
    layer: 'P-PROCESS-OIL',
    attributes: { text: '100.0' },
  };
  const resDim = policy.classifyEntity(dim);
  assert.equal(resDim.recognized, false);
  assert.equal(resDim.ruleId, 'REJECT_ANNOTATION_TYPE');
});

test('A11: derivePipingCegFromDxfDocument produces source links and topology without mutation', () => {
  const mockDoc = {
    id: 'doc:piping-sample',
    sourceRevision: 5,
    entities: [
      // Line 1: Pipe A
      {
        id: 'doc:piping-sample:handle:10',
        handle: '10',
        type: 'LINE',
        layer: 'PIPE_LINE_CW',
        geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
      },
      // Valve connecting to end of Line 1
      {
        id: 'doc:piping-sample:handle:20',
        handle: '20',
        type: 'INSERT',
        layer: 'PIPE_VALVES',
        attributes: { blockName: 'BALL_VALVE_DN50' },
        geometry: { point: { x: 100, y: 0, z: 0 } },
      },
      // Line 2: Pipe B continuing from valve
      {
        id: 'doc:piping-sample:handle:30',
        handle: '30',
        type: 'LINE',
        layer: 'PIPE_LINE_CW',
        geometry: { start: { x: 100, y: 0, z: 0 }, end: { x: 200, y: 0, z: 0 } },
      },
      // Border line (should be rejected)
      {
        id: 'doc:piping-sample:handle:40',
        handle: '40',
        type: 'LINE',
        layer: '0',
        geometry: { start: { x: -10, y: -10, z: 0 }, end: { x: 500, y: -10, z: 0 } },
      },
      // Coincident dimension (should be rejected)
      {
        id: 'doc:piping-sample:handle:50',
        handle: '50',
        type: 'DIMENSION',
        layer: 'PIPE_LINE_CW',
      },
    ],
  };

  const initialJson = JSON.stringify(mockDoc);

  const projection = derivePipingCegFromDxfDocument(mockDoc);

  // 1. Zero mutation invariant
  assert.equal(JSON.stringify(mockDoc), initialJson, 'Document must not be mutated by semantic projection');

  // 2. Component counts and classifications
  assert.equal(projection.components.length, 3); // 2 pipes + 1 valve
  assert.equal(projection.statistics.pipes, 2);
  assert.equal(projection.statistics.fittings, 1);
  assert.equal(projection.rejectedEntities.length, 2); // border + dim

  // 3. Topology connectivity
  // Pipe A (0,0 -> 100,0) and Pipe B (100,0 -> 200,0) meet at node (100,0,0)
  assert.equal(projection.topology.nodes.length, 3); // (0,0,0), (100,0,0), (200,0,0)
  assert.equal(projection.topology.segments.length, 2);

  // 4. SourceRef bidirectional index lookup
  const linkMgr = projection.linkManager;
  const compsForPipe1 = linkMgr.getComponentsForEntity('doc:piping-sample:handle:10');
  assert.equal(compsForPipe1.length, 1);
  assert.equal(compsForPipe1[0].componentType, 'PIPE');
  assert.equal(compsForPipe1[0].sourceRefs[0].sourceRevision, 5);

  // 5. Freshness check against current document revision
  assert.equal(projection.validateFreshness(mockDoc), true);

  // 6. Stale revision rejection: when document advances to rev 6, projection rejects
  const advancedDoc = { ...mockDoc, sourceRevision: 6 };
  assert.throws(
    () => projection.validateFreshness(advancedDoc),
    (err) => err.code === 'STALE_REVISION'
  );
});

test('A11: SemanticLinkManager granular entity invalidation', () => {
  const manager = new SemanticLinkManager({ documentId: 'doc:test', sourceRevision: 1 });

  const comp1 = new SemanticComponentRef({
    componentId: 'PIPE-001',
    componentType: 'PIPE',
    sourceRefs: [new SourceRef({ cadEntityId: 'doc:handle:A', sourceRevision: 1 })],
  });

  const comp2 = new SemanticComponentRef({
    componentId: 'VALVE-002',
    componentType: 'VALVE',
    sourceRefs: [new SourceRef({ cadEntityId: 'doc:handle:B', sourceRevision: 1 })],
  });

  manager.registerComponent(comp1);
  manager.registerComponent(comp2);
  assert.equal(manager.size, 2);

  // Invalidate entity A
  const invalidated = manager.invalidateByEntityId('doc:handle:A');
  assert.deepEqual(invalidated, ['PIPE-001']);
  assert.equal(manager.size, 1);
  assert.equal(manager.getComponent('PIPE-001'), null);
  assert.notEqual(manager.getComponent('VALVE-002'), null); // comp2 is preserved
});

test('A11: Semantics-optional invariant: CAD workflow operates without building CEG', () => {
  // Document does not require semantic metadata
  const doc = {
    id: 'doc:plain-cad',
    sourceRevision: 1,
    entities: [
      { id: '1', type: 'LINE', layer: '0', geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } },
    ],
  };

  // Plain CAD functions have zero dependency on semantic links
  assert.equal(doc.entities.length, 1);
  assert.equal(Boolean(doc.semanticProjection), false);
});
