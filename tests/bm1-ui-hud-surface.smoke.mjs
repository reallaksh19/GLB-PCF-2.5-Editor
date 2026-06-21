import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_UI_HUD_SURFACE_VERSION,
  assertBm1UiHudSurfaceReady,
  createBm1UiHudSurface,
} from '../benchmarks/bm1-ui-hud-surface.js';

test('BM1 UI/HUD surface exposes compact action and status cards', () => {
  const surface = createBm1UiHudSurface();
  assert.equal(surface.version, BM1_UI_HUD_SURFACE_VERSION);
  assert.equal(surface.benchmarkId, 'BM1');
  assert.equal(surface.mode, 'CENTERLINE');
  assert.equal(surface.ok, true);
  assert.equal(assertBm1UiHudSurfaceReady(surface), true);

  const cards = new Map(surface.cards.map((card) => [card.id, card]));
  assert.ok(cards.has('bm1-surface-benchmark'));
  assert.ok(cards.has('bm1-surface-fittings'));
  assert.ok(cards.has('bm1-surface-supports'));
  assert.ok(cards.has('bm1-surface-export'));
  assert.ok(cards.has('bm1-surface-real-port'));
});

test('BM1 UI/HUD surface maps visible actions to existing BM1 contract actions', () => {
  const surface = createBm1UiHudSurface();
  const actions = surface.cards.flatMap((card) => card.actions || []);
  const actionIds = actions.map((action) => action.id).sort();
  for (const id of ['bm1.load', 'bm1.validate', 'bm1.auto-bend', 'bm1.auto-tee', 'bm1.flange-pair', 'bm1.break-support']) {
    assert.ok(actionIds.includes(id), `${id} should be surfaced`);
  }
  assert.ok(actions.every((action) => ['macro', 'service', 'route'].includes(action.kind)));
});

test('BM1 UI/HUD surface carries export readiness and real-port blocked status', () => {
  const surface = createBm1UiHudSurface();
  const exportCard = surface.cards.find((card) => card.id === 'bm1-surface-export');
  const realPortCard = surface.cards.find((card) => card.id === 'bm1-surface-real-port');

  assert.equal(exportCard.summary.dxf, 'READY');
  assert.equal(exportCard.summary.glb, 'READY');
  assert.equal(exportCard.summary.rvm, 'READY');
  assert.equal(exportCard.summary.att, 'READY');
  assert.equal(exportCard.summary.fabrication, 'DEFERRED');
  assert.equal(realPortCard.summary.status, 'BLOCKED');
  assert.equal(realPortCard.summary.implementationAllowed, false);
});

test('BM1 UI/HUD surface remains data-only and renderer-independent', () => {
  const source = readFileSync('benchmarks/bm1-ui-hud-surface.js', 'utf8');
  for (const forbidden of ['window', 'document', 'localStorage', 'querySelector', 'addEventListener', 'SceneRenderer', 'three', 'Blob', 'URL.createObjectURL']) {
    assert.equal(source.includes(forbidden), false, `BM1 UI/HUD surface must not depend on ${forbidden}`);
  }
});
