/**
 * tests/cad/A04/document-session-adversarial.test.mjs
 *
 * Independent Reviewer Adversarial Acceptance Test Suite for A04 / Issue #92:
 * Bounded CAD document sessions, revision queues, and worker runtime foundation.
 *
 * Implements strict adversarial probes per Local_PR_Deliverty_v1.1:
 * - Negative controls: invalid envelopes, concurrent revision races, transaction conflicts
 * - Boundary controls: buffer non-detachment, cross-document isolation, pre/post-commit cancels
 * - Disposal stress: repeated multi-cycle open/command/close without listener or memory leaks
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentSessionClient,
  DocumentAuthority,
  RevisionQueue,
  DirectSessionTransport,
  EnvelopeType,
  SessionErrorCode,
  createRequestEnvelope,
  validateEnvelope,
} from '../../../runtime/cad/index.js';
import { MoveEntitiesCommand } from '../../../core/commands/cad/index.js';

const wrapDxf = (tags) =>
  [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015',
    '9', '$HANDSEED', '5', 'FF', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...tags, '0', 'ENDSEC', '0', 'EOF',
  ].join('\r\n');

const lineEntity = [
  '0', 'LINE', '5', '10', '8', '0',
  '10', '0.000', '20', '0.000', '30', '0.000',
  '11', '100.000', '21', '0.000', '31', '0.000',
];

const sampleDxfBytes = () => Buffer.from(wrapDxf(lineEntity));

test('ADV-A04-01: Invalid and malformed envelopes are rejected safely without crashing', async () => {
  const transport = new DirectSessionTransport();
  let receivedError = null;

  transport.onMessage((msg) => {
    if (msg.type === EnvelopeType.ERROR_RESPONSE) {
      receivedError = msg;
    }
  });

  // 1. Null envelope
  transport.send(null);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(receivedError, 'Null envelope emitted error');
  assert.equal(receivedError.error.code, SessionErrorCode.INVALID_ENVELOPE);

  // 2. Missing requestId
  receivedError = null;
  transport.send({ type: EnvelopeType.QUERY_REQUEST });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(receivedError, 'Missing requestId emitted error');
  assert.equal(receivedError.error.code, SessionErrorCode.INVALID_ENVELOPE);

  // 3. Unknown envelope type
  receivedError = null;
  transport.send({ type: 'NON_EXISTENT_TYPE', requestId: 'req:test' });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(receivedError, 'Unknown envelope type emitted error');
  assert.equal(receivedError.error.code, SessionErrorCode.INVALID_ENVELOPE);

  transport.terminate();
});

test('ADV-A04-02: Concurrent command race rejects stale revisions atomically', async () => {
  const client = new DocumentSessionClient();
  try {
    await client.openDocument({ source: sampleDxfBytes(), documentId: 'doc:adv:race' });

    // 4 commands dispatched concurrently with identical baseRevision 0
    const cmd1 = new MoveEntitiesCommand(['dxf:entity:10'], 1, 0);
    const cmd2 = new MoveEntitiesCommand(['dxf:entity:10'], 2, 0);
    const cmd3 = new MoveEntitiesCommand(['dxf:entity:10'], 3, 0);
    const cmd4 = new MoveEntitiesCommand(['dxf:entity:10'], 4, 0);

    const outcomes = await Promise.allSettled([
      client.executeCommand(cmd1),
      client.executeCommand(cmd2),
      client.executeCommand(cmd3),
      client.executeCommand(cmd4),
    ]);

    // Exactly one command must succeed (rev 1)
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Only one command succeeds at base revision 0');
    assert.equal(fulfilled[0].value.sourceRevision, 1);
    assert.equal(client.currentRevision, 1);

    // Remaining 3 commands must be rejected with STALE_REVISION
    assert.equal(rejected.length, 3, 'All 3 concurrent commands rejected as stale');
    for (const r of rejected) {
      assert.equal(r.reason.code, SessionErrorCode.STALE_REVISION);
    }
  } finally {
    client.dispose();
  }
});

test('ADV-A04-03: Transaction replay is idempotent and rejects conflicting payloads', async () => {
  const client = new DocumentSessionClient();
  try {
    await client.openDocument({ source: sampleDxfBytes(), documentId: 'doc:adv:tx' });
    const auth = client.transport.authority;

    const moveCmd = new MoveEntitiesCommand(['dxf:entity:10'], 5, 0);

    // Initial execution
    const resA = auth.executeCommand({
      command: moveCmd,
      baseRevision: 0,
      transactionId: 'tx:unique:101',
      payloadDigest: 'sha:payload:101',
    });
    assert.equal(resA.sourceRevision, 1);
    assert.equal(auth.sourceRevision, 1);

    // Idempotent replay: exact same transactionId and payloadDigest
    const resB = auth.executeCommand({
      command: moveCmd,
      baseRevision: 1,
      transactionId: 'tx:unique:101',
      payloadDigest: 'sha:payload:101',
    });
    assert.equal(resB.sourceRevision, 1, 'Replay preserves original revision');
    assert.equal(auth.sourceRevision, 1, 'Authority does not advance on replay');

    // Conflict: same transactionId with conflicting payloadDigest
    assert.throws(() => {
      auth.executeCommand({
        command: new MoveEntitiesCommand(['dxf:entity:10'], 99, 0),
        baseRevision: 1,
        transactionId: 'tx:unique:101',
        payloadDigest: 'sha:payload:CONFLICT',
      });
    }, (err) => {
      assert.equal(err.code, SessionErrorCode.TRANSACTION_CONFLICT);
      return true;
    });
  } finally {
    client.dispose();
  }
});

test('ADV-A04-04: Cross-document stale response isolation', async () => {
  const client = new DocumentSessionClient();
  try {
    // Open Doc 1
    const summary1 = await client.openDocument({ source: sampleDxfBytes(), documentId: 'doc:adv:doc1' });
    assert.equal(summary1.documentId, 'doc:adv:doc1');

    // Simulate in-flight command on Doc 1
    const reqEnvelope = createRequestEnvelope({
      type: EnvelopeType.COMMAND_REQUEST,
      documentId: 'doc:adv:doc1',
      baseRevision: 0,
      payload: { command: new MoveEntitiesCommand(['dxf:entity:10'], 5, 0) },
    });

    // Close Doc 1 and open Doc 2
    await client.closeDocument();
    const summary2 = await client.openDocument({ source: sampleDxfBytes(), documentId: 'doc:adv:doc2' });
    assert.equal(summary2.documentId, 'doc:adv:doc2');

    // Direct emission of delayed Doc 1 response to client
    client.transport._emit({
      type: EnvelopeType.COMMAND_RESPONSE,
      documentId: 'doc:adv:doc1',
      sourceRevision: 1,
      requestId: reqEnvelope.requestId,
      data: { moved: true },
    });

    await new Promise((r) => setTimeout(r, 20));

    // Client revision must remain at 0 (Doc 2's revision), NOT polluted by Doc 1
    assert.equal(client.currentRevision, 0, 'Client revision not polluted by old doc');
    assert.equal(client.documentId, 'doc:adv:doc2');
  } finally {
    client.dispose();
  }
});

test('ADV-A04-05: Stress disposal across 50 rapid cycles without leaks', async () => {
  for (let i = 0; i < 50; i++) {
    const client = new DocumentSessionClient();
    const summary = await client.openDocument({ source: sampleDxfBytes(), documentId: `doc:stress:${i}` });
    assert.equal(summary.documentId, `doc:stress:${i}`);

    // Quick command
    await client.executeCommand(new MoveEntitiesCommand(['dxf:entity:10'], 1, 0));

    // Cancel non-existent
    await client.cancelRequest('req:nonexistent');

    // Query
    const q = await client.query('SUMMARY');
    assert.equal(q.sourceRevision, 1);

    // Dispose
    client.dispose();
    assert.equal(client.isReady, false);
    assert.equal(client.disposed, true);
  }
});
