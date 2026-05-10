/**
 * Viewer UI state model with explicit actions.
 * Keeps interaction state deterministic and decoupled from DOM wiring.
 */

import {
  VISUAL_PROFILES,
  resolveVisualProfile,
  setVisualProfile as applyVisualProfileSettings,
  toggleLineDiagram as applyLineDiagramToggle,
} from '../../core/view/visual-profile.js';

export const VIEWER_UI_MODES = Object.freeze({
  draft2d: 'draft2d',
  stick: 'stick',
  mode3d: '3d',
});

export const VIEWER_UI_ACTIONS = Object.freeze({
  setActiveTool: 'set-active-tool',
  setActiveMode: 'set-active-mode',

  // Slice 2 canonical profile actions.
  setVisualProfile: 'set-visual-profile',
  toggleLineDiagram: 'toggle-line-diagram',

  // Backward-compatible legacy action.
  toggleStick: 'toggle-stick',

  setPanelVisibility: 'set-panel-visibility',
  setInspectorSection: 'set-inspector-section',
  setSelectedComponentId: 'set-selected-component-id',
  setTheme: 'set-theme',
});

function assertMode(mode) {
  if (mode === VIEWER_UI_MODES.draft2d) return mode;
  if (mode === VIEWER_UI_MODES.stick) return mode;
  if (mode === VIEWER_UI_MODES.mode3d) return mode;
  throw new Error(`Unsupported viewer mode: ${mode}`);
}

function visualProfileFromMode(mode) {
  const safeMode = assertMode(mode);

  if (safeMode === VIEWER_UI_MODES.stick) {
    return VISUAL_PROFILES.LINE_DIAGRAM;
  }

  if (safeMode === VIEWER_UI_MODES.draft2d) {
    return VISUAL_PROFILES.DRAFT_2D;
  }

  return VISUAL_PROFILES.SOLID_3D;
}

function modeFromVisualProfile(visualProfile) {
  if (visualProfile === VISUAL_PROFILES.LINE_DIAGRAM) {
    return VIEWER_UI_MODES.stick;
  }

  if (visualProfile === VISUAL_PROFILES.DRAFT_2D) {
    return VIEWER_UI_MODES.draft2d;
  }

  return VIEWER_UI_MODES.mode3d;
}

function syncVisualState(state, visualProfile) {
  const nextVisual = applyVisualProfileSettings(state, visualProfile);

  return {
    ...nextVisual,
    activeMode: modeFromVisualProfile(nextVisual.visualProfile),
    lineDiagramEnabled: nextVisual.visualProfile === VISUAL_PROFILES.LINE_DIAGRAM,
  };
}

function initialVisualProfileFromState(initialState = {}) {
  if (initialState.visualProfile != null) {
    return resolveVisualProfile({ visualProfile: initialState.visualProfile });
  }

  if (initialState.activeMode != null) {
    return visualProfileFromMode(initialState.activeMode);
  }

  return resolveVisualProfile(initialState);
}

function reduceViewerUiState(state, action) {
  if (!action || typeof action !== 'object') return state;

  if (action.type === VIEWER_UI_ACTIONS.setActiveTool) {
    return { ...state, activeTool: action.tool || null };
  }

  if (action.type === VIEWER_UI_ACTIONS.setActiveMode) {
    const mode = assertMode(action.mode);
    return syncVisualState(state, visualProfileFromMode(mode));
  }

  if (action.type === VIEWER_UI_ACTIONS.setVisualProfile) {
    return syncVisualState(state, action.visualProfile || action.profile);
  }

  if (action.type === VIEWER_UI_ACTIONS.toggleLineDiagram) {
    const nextVisual = applyLineDiagramToggle(state, action.enabled);
    return {
      ...nextVisual,
      activeMode: modeFromVisualProfile(nextVisual.visualProfile),
      lineDiagramEnabled: nextVisual.visualProfile === VISUAL_PROFILES.LINE_DIAGRAM,
    };
  }

  if (action.type === VIEWER_UI_ACTIONS.toggleStick) {
    const nextVisual = applyLineDiagramToggle(state);
    return {
      ...nextVisual,
      activeMode: modeFromVisualProfile(nextVisual.visualProfile),
      lineDiagramEnabled: nextVisual.visualProfile === VISUAL_PROFILES.LINE_DIAGRAM,
    };
  }

  if (action.type === VIEWER_UI_ACTIONS.setPanelVisibility) {
    const panelKey = String(action.panelKey || '');
    if (!panelKey) return state;

    return {
      ...state,
      panelVisibility: {
        ...state.panelVisibility,
        [panelKey]: Boolean(action.open),
      },
    };
  }

  if (action.type === VIEWER_UI_ACTIONS.setInspectorSection) {
    return { ...state, inspectorSection: action.section || 'component' };
  }

  if (action.type === VIEWER_UI_ACTIONS.setSelectedComponentId) {
    return { ...state, selectedComponentId: action.componentId || null };
  }

  if (action.type === VIEWER_UI_ACTIONS.setTheme) {
    return { ...state, theme: action.theme || state.theme };
  }

  return state;
}

export function createViewerUiStore(initialState = {}) {
  const initialVisualProfile = initialVisualProfileFromState(initialState);

  let state = syncVisualState({
    activeTool: null,
    activeMode: VIEWER_UI_MODES.draft2d,
    visualProfile: VISUAL_PROFILES.DRAFT_2D,
    lineDiagramEnabled: false,
    lineDiagram: false,
    wireframe: false,
    draft2d: true,
    solid3d: false,
    panelVisibility: {
      leftPalette: true,
      rightViewbar: true,
      inspector: true,
      macro: false,
      hud: true,
    },
    inspectorSection: 'component',
    selectedComponentId: null,
    theme: 'NavisDark',
    ...initialState,
  }, initialVisualProfile);

  const listeners = new Set();

  function getState() {
    return state;
  }

  function dispatch(action) {
    const next = reduceViewerUiState(state, action);

    if (next === state) return state;

    state = next;

    listeners.forEach((listener) => {
      try {
        listener(state, action);
      } catch (_) {
        // State listeners must not break UI reducer flow.
      }
    });

    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    dispatch,
    subscribe,
  };
}
