import assert from 'node:assert/strict';
import {
  VIEWER_UI_ACTIONS,
  VIEWER_UI_MODES,
  createViewerUiStore,
} from '../js/ui/viewer-ui-state.js';
import { VISUAL_PROFILES } from '../core/view/visual-profile.js';

const store = createViewerUiStore({
  visualProfile: VISUAL_PROFILES.DRAFT_2D,
});

let state = store.getState();

assert.equal(state.snapEnabled, true);
assert.equal(state.layersOpen, false);
assert.equal(state.viewLocked, false);
assert.equal(state.cursorPoint, null);
assert.equal(state.activeMode, VIEWER_UI_MODES.draft2d);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleSnap,
});

assert.equal(state.snapEnabled, false);
assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleSnap,
  enabled: true,
});

assert.equal(state.snapEnabled, true);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleLayers,
});

assert.equal(state.layersOpen, true);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleLayers,
  open: false,
});

assert.equal(state.layersOpen, false);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleViewLock,
});

assert.equal(state.viewLocked, true);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleViewLock,
  locked: false,
});

assert.equal(state.viewLocked, false);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setCursorPoint,
  point: { x: 100.25, y: 'bad', z: -5 },
});

assert.deepEqual(state.cursorPoint, {
  x: 100.25,
  y: 0,
  z: -5,
});

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setActiveTool,
  tool: 'line',
});

assert.equal(state.activeTool, 'line');
assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setActiveMode,
  mode: VIEWER_UI_MODES.stick,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(state.snapEnabled, true);
assert.equal(state.layersOpen, false);
assert.equal(state.viewLocked, false);
assert.deepEqual(state.cursorPoint, { x: 100.25, y: 0, z: -5 });

console.log('PASS viewer-ui-shell-state.smoke.mjs');
