/**
 * core/state.js — Minimal app state stub.
 * Provides the fields that geometry/pipe-geometry.js and geometry/symbols.js read.
 * Replace with a full Zustand store in Release 2.
 */
export const state = {
  viewerSettings: {
    /** Coordinate convention used by toThree() in pipe-geometry.js */
    axisConvention: 'Z-up',
    /** UI theme preset: 'DrawLight' | 'NavisDark' | 'DrawDark' */
    themePreset: 'DrawLight',
    /** Whether CSS2D labels are shown */
    showLabels: true,
    /** Whether support/restraint name labels are shown */
    showRestraintNames: true,
    /** Label font size in px */
    labelFontSize: 12,
    /** Label background colour */
    labelBackground: 'rgba(15,23,42,0.82)',
    /** Label display mode */
    labelMode: 'id',
    /** Relative label density multiplier */
    labelDensity: 1.0,
    /** Restraint symbol scale multiplier */
    restraintSymbolScale: 1.0,
  },
};


/**
 * Wave 0 orchestrator baseline for future editor slices.
 * Non-breaking additive exports only.
 */
export const initialEditorState = {
  model: { components: [], routes: [] },
  selection: { ids: [] },
  hud: { mode: 'idle', draft: null },
  intelligence: { lastResolution: null },
  macro: { lastRun: null },
  diagnostics: { traces: [], metrics: {} },
};

export function createInitialEditorState() {
  return JSON.parse(JSON.stringify(initialEditorState));
}
