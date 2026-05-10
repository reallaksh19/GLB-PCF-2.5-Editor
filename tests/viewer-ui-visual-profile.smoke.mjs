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

assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(state.activeMode, VIEWER_UI_MODES.draft2d);
assert.equal(state.lineDiagramEnabled, false);
assert.equal(state.draft2d, true);
assert.equal(state.solid3d, false);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setVisualProfile,
  visualProfile: VISUAL_PROFILES.LINE_DIAGRAM,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(state.activeMode, VIEWER_UI_MODES.stick);
assert.equal(state.lineDiagramEnabled, true);
assert.equal(state.lineDiagram, true);
assert.equal(state.draft2d, false);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setVisualProfile,
  visualProfile: VISUAL_PROFILES.SOLID_3D,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.SOLID_3D);
assert.equal(state.activeMode, VIEWER_UI_MODES.mode3d);
assert.equal(state.lineDiagramEnabled, false);
assert.equal(state.solid3d, true);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleLineDiagram,
  enabled: true,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(state.activeMode, VIEWER_UI_MODES.stick);
assert.equal(state.lineDiagramEnabled, true);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleLineDiagram,
  enabled: false,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(state.activeMode, VIEWER_UI_MODES.draft2d);
assert.equal(state.lineDiagramEnabled, false);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setActiveMode,
  mode: VIEWER_UI_MODES.stick,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(state.activeMode, VIEWER_UI_MODES.stick);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setActiveMode,
  mode: VIEWER_UI_MODES.draft2d,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(state.activeMode, VIEWER_UI_MODES.draft2d);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setActiveMode,
  mode: VIEWER_UI_MODES.mode3d,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.SOLID_3D);
assert.equal(state.activeMode, VIEWER_UI_MODES.mode3d);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleStick,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(state.activeMode, VIEWER_UI_MODES.stick);
assert.equal(state.lineDiagramEnabled, true);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.toggleStick,
});

assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(state.activeMode, VIEWER_UI_MODES.draft2d);
assert.equal(state.lineDiagramEnabled, false);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setTheme,
  theme: 'Blueprint',
});

assert.equal(state.theme, 'Blueprint');
assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(state.activeMode, VIEWER_UI_MODES.draft2d);

state = store.dispatch({
  type: VIEWER_UI_ACTIONS.setPanelVisibility,
  panelKey: 'macro',
  open: true,
});

assert.equal(state.panelVisibility.macro, true);
assert.equal(state.visualProfile, VISUAL_PROFILES.DRAFT_2D);

const legacyStickStore = createViewerUiStore({
  activeMode: VIEWER_UI_MODES.stick,
});

const legacyStickState = legacyStickStore.getState();
assert.equal(legacyStickState.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(legacyStickState.lineDiagramEnabled, true);

console.log('PASS viewer-ui-visual-profile.smoke.mjs');
