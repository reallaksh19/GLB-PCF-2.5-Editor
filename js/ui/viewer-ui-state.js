/**
 * Viewer UI state model with explicit actions.
 * Keeps interaction state deterministic and decoupled from DOM wiring.
 */

export const VIEWER_UI_MODES = Object.freeze({
  draft2d: 'draft2d',
  stick: 'stick',
  mode3d: '3d',
});

export const VIEWER_UI_ACTIONS = Object.freeze({
  setActiveTool: 'set-active-tool',
  setActiveMode: 'set-active-mode',
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

function reduceViewerUiState(state, action) {
  if (!action || typeof action !== 'object') return state;

  if (action.type === VIEWER_UI_ACTIONS.setActiveTool) {
    return { ...state, activeTool: action.tool || null };
  }

  if (action.type === VIEWER_UI_ACTIONS.setActiveMode) {
    const mode = assertMode(action.mode);
    return { ...state, activeMode: mode, lineDiagramEnabled: mode === VIEWER_UI_MODES.stick };
  }

  if (action.type === VIEWER_UI_ACTIONS.toggleStick) {
    const nextEnabled = !Boolean(state.lineDiagramEnabled);
    return {
      ...state,
      lineDiagramEnabled: nextEnabled,
      activeMode: nextEnabled ? VIEWER_UI_MODES.stick : VIEWER_UI_MODES.draft2d,
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

export function createViewerUiStore(initialState) {
  let state = {
    activeTool: null,
    activeMode: VIEWER_UI_MODES.draft2d,
    lineDiagramEnabled: false,
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
    ...(initialState || {}),
  };

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
      } catch (_) {}
    });
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, dispatch, subscribe };
}
