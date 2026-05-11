/**
 * Canonical DOM contract for the HiFi 2.5D viewer shell.
 * All viewer/debug/design tab selectors are centralized here.
 */

export const TAB_IDS = Object.freeze({
  viewer: 'hifi-tab-viewer',
  debug: 'hifi-tab-debug',
  design: 'hifi-tab-design',
});

export const PANEL_IDS = Object.freeze({
  viewer: 'hifi-panel-viewer',
  debug: 'hifi-panel-debug',
  design: 'hifi-panel-design',
});

export const VIEWER_UI_IDS = Object.freeze({
  themeToggle: 'hifi-theme-toggle',
  topToolbar: 'hifi-viewer-toolbar',
  canvas: 'hifi-viewer-canvas',

  activeToolPill: 'hifi-canvas-active-pill',
  viewBadge: 'hifi-canvas-view-badge',
  snapBar: 'hifi-canvas-snapbar',
  cursorCoord: 'hifi-cursor-coord',
  snapMode: 'hifi-snap-mode',
  activeProfile: 'hifi-active-profile',

  leftPalette: 'hifi-left-palette',
  leftPaletteToggle: 'hifi-left-palette-toggle',
  rightViewbar: 'hifi-right-viewbar',
  rightViewbarToggle: 'hifi-right-viewbar-toggle',
  inspectorShell: 'hifi-inspector-shell',
  inspectorToggle: 'hifi-inspector-toggle',
  inspector: 'hifi-viewer-inspector',
  statusInline: 'hifi-viewer-status',
  statusDot: 'hifi-status-dot',
  statusText: 'hifi-status-text',
  panelInfo: 'hifi-status-info',

  pcfInput: 'hifi-input-pcf',
  glbInput: 'hifi-input-glb',
  openPcf: 'hifi-btn-open-pcf',
  openGlb: 'hifi-btn-open-glb',
  exportGlb: 'hifi-btn-export-glb',
  exportDxf: 'hifi-btn-export-dxf',
  openMasterDb: 'hifi-btn-masterdb',

  modeDraft2d: 'hifi-btn-mode-draft2d',
  mode3d: 'hifi-btn-mode-3d',
  toggleStick: 'hifi-btn-toggle-stick',

  heatmap: 'hifi-select-heatmap',
  labels: 'hifi-toggle-labels',
  theme: 'hifi-select-theme',

  fitMain: 'hifi-btn-fit-main',
  fitViewbar: 'hifi-btn-fit-viewbar',
  snapToggle: 'hifi-btn-snap-toggle',
  layerToggle: 'hifi-btn-layer-toggle',
  lockView: 'hifi-btn-lock-view',
  viewCube: 'hifi-btn-view-cube',

  toolLine: 'hifi-tool-line',
  toolPolyline: 'hifi-tool-polyline',
  toolSpline: 'hifi-tool-spline',
  toolCircle: 'hifi-tool-circle',
  toolArc: 'hifi-tool-arc',
  toolValve: 'hifi-tool-valve',
  toolFlange: 'hifi-tool-flange',
  toolTee: 'hifi-tool-tee',
  toolSupport: 'hifi-tool-support',
  toolMove: 'hifi-tool-move',
  toolStretch: 'hifi-tool-stretch',
  toolRotate: 'hifi-tool-rotate',
  toolBreak: 'hifi-tool-break',
  toolDelete: 'hifi-tool-delete',
  convertBend: 'hifi-btn-convert-bend',
  convertTee: 'hifi-btn-convert-tee',

  macroToggle: 'hifi-btn-macro-toggle',
  macroTray: 'hifi-macro-tray',
  incrementalSync: 'hifi-btn-incremental-sync',
});

export const DEBUG_UI_IDS = Object.freeze({
  refresh: 'hifi-debug-refresh',
  copyJson: 'hifi-debug-copy-json',
  exportLog: 'hifi-debug-export-log',
  domainLabel: 'hifi-debug-domain-label',
  content: 'hifi-debug-content',
});

export const DEBUG_SECTION_ATTR = 'data-hifi-debug-section';

export function byId(id) {
  return document.getElementById(id);
}

export function queryAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}

export function getTabButton(tabName) {
  return byId(TAB_IDS[tabName]);
}

export function getTabPanel(tabName) {
  return byId(PANEL_IDS[tabName]);
}
