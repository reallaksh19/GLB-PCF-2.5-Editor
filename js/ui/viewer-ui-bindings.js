import {
  VIEWER_UI_IDS,
  byId,
  queryAll,
} from './viewer-ui-contract.js';
import {
  VIEWER_UI_ACTIONS,
  VIEWER_UI_MODES,
} from './viewer-ui-state.js';
import { appLogger } from '../debug/logger.js';

function bindClick(id, handler, unsubs) {
  const el = byId(id);
  if (!el || typeof handler !== 'function') return;
  const wrapped = async (event) => {
    try {
      await handler(event);
    } catch (err) {
      appLogger.error('VIEWER_UI_CLICK_FAIL', {
        id,
        message: String(err?.message || err),
      });
    }
  };
  el.addEventListener('click', wrapped);
  unsubs.push(() => el.removeEventListener('click', wrapped));
}

function bindChange(id, handler, unsubs) {
  const el = byId(id);
  if (!el || typeof handler !== 'function') return;
  const wrapped = async (event) => {
    try {
      await handler(event);
    } catch (err) {
      appLogger.error('VIEWER_UI_CHANGE_FAIL', {
        id,
        message: String(err?.message || err),
      });
    }
  };
  el.addEventListener('change', wrapped);
  unsubs.push(() => el.removeEventListener('change', wrapped));
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function updateModeButtons(state) {
  byId(VIEWER_UI_IDS.modeDraft2d)?.classList.toggle('active', state.activeMode === VIEWER_UI_MODES.draft2d);
  byId(VIEWER_UI_IDS.mode3d)?.classList.toggle('active', state.activeMode === VIEWER_UI_MODES.mode3d);
  byId(VIEWER_UI_IDS.toggleStick)?.classList.toggle('active', state.activeMode === VIEWER_UI_MODES.stick);
}

function updateToolButtons(state) {
  queryAll('[data-hifi-tool]').forEach((button) => {
    button.classList.toggle('active', state.activeTool === button.getAttribute('data-hifi-tool'));
  });
}

function updateMacroTray(state) {
  byId(VIEWER_UI_IDS.macroTray)?.classList.toggle('open', Boolean(state.panelVisibility?.macro));
  byId(VIEWER_UI_IDS.macroToggle)?.classList.toggle('active', Boolean(state.panelVisibility?.macro));
}

function updatePanelChrome(state) {
  const leftOpen = state.panelVisibility?.leftPalette !== false;
  const rightOpen = state.panelVisibility?.rightViewbar !== false;
  const inspectorOpen = state.panelVisibility?.inspector !== false;

  byId(VIEWER_UI_IDS.leftPalette)?.classList.toggle('collapsed', !leftOpen);
  byId(VIEWER_UI_IDS.rightViewbar)?.classList.toggle('collapsed', !rightOpen);
  byId(VIEWER_UI_IDS.inspectorShell)?.classList.toggle('collapsed', !inspectorOpen);

  const leftToggle = byId(VIEWER_UI_IDS.leftPaletteToggle);
  const rightToggle = byId(VIEWER_UI_IDS.rightViewbarToggle);
  const inspectorToggle = byId(VIEWER_UI_IDS.inspectorToggle);

  if (leftToggle) leftToggle.innerHTML = leftOpen ? '&lsaquo;' : '&rsaquo;';
  if (rightToggle) rightToggle.innerHTML = rightOpen ? '&rsaquo;' : '&lsaquo;';
  if (inspectorToggle) inspectorToggle.innerHTML = inspectorOpen ? '&rsaquo;' : '&lsaquo;';
}

export function initViewerUiBindings(config) {
  const {
    store,
    onModeChange,
    onToggleLineDiagram,
    onCameraAction,
    onSelect,
    onPanelChange,
    onOpenTextModel,
    onOpenGlbFile,
    onThemeChange,
    onHeatmapChange,
    onLabelsVisibleChange,
    onExportGlb,
    onExportDxf,
    onOpenMasterDb,
    onShowHudLineMode,
    onShowHudPolylineMode,
    onShowHudSplineMode,
    onShowHudInsertMode,
    onActivateModifyTool,
    onAutoBend,
    onAutoTee,
  } = config || {};

  if (!store) throw new Error('Viewer UI bindings require a store');

  const unsubs = [];

  const pcfInput = byId(VIEWER_UI_IDS.pcfInput);
  const glbInput = byId(VIEWER_UI_IDS.glbInput);

  bindClick(VIEWER_UI_IDS.openPcf, () => pcfInput?.click(), unsubs);
  bindClick(VIEWER_UI_IDS.openGlb, () => glbInput?.click(), unsubs);

  bindChange(VIEWER_UI_IDS.pcfInput, async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const text = await readTextFile(file);
    await onOpenTextModel?.(text, file.name);
    event.target.value = '';
  }, unsubs);

  bindChange(VIEWER_UI_IDS.glbInput, async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    await onOpenGlbFile?.(file);
    event.target.value = '';
  }, unsubs);

  bindClick(VIEWER_UI_IDS.modeDraft2d, () => {
    store.dispatch({ type: VIEWER_UI_ACTIONS.setActiveMode, mode: VIEWER_UI_MODES.draft2d });
    onModeChange?.(VIEWER_UI_MODES.draft2d);
  }, unsubs);

  bindClick(VIEWER_UI_IDS.mode3d, () => {
    store.dispatch({ type: VIEWER_UI_ACTIONS.setActiveMode, mode: VIEWER_UI_MODES.mode3d });
    onModeChange?.(VIEWER_UI_MODES.mode3d);
  }, unsubs);

  bindClick(VIEWER_UI_IDS.toggleStick, () => {
    store.dispatch({ type: VIEWER_UI_ACTIONS.toggleStick });
    const state = store.getState();
    onToggleLineDiagram?.(Boolean(state.lineDiagramEnabled));
    onModeChange?.(state.activeMode);
  }, unsubs);

  bindChange(VIEWER_UI_IDS.heatmap, (event) => onHeatmapChange?.(event.target?.value || 'none'), unsubs);
  bindChange(VIEWER_UI_IDS.labels, (event) => onLabelsVisibleChange?.(Boolean(event.target?.checked)), unsubs);
  bindChange(VIEWER_UI_IDS.theme, (event) => {
    const nextTheme = event.target?.value || 'NavisDark';
    store.dispatch({ type: VIEWER_UI_ACTIONS.setTheme, theme: nextTheme });
    onThemeChange?.(nextTheme);
  }, unsubs);

  bindClick(VIEWER_UI_IDS.exportGlb, () => onExportGlb?.(), unsubs);
  bindClick(VIEWER_UI_IDS.exportDxf, () => onExportDxf?.(), unsubs);
  bindClick(VIEWER_UI_IDS.openMasterDb, () => onOpenMasterDb?.(), unsubs);

  bindClick(VIEWER_UI_IDS.fitMain, () => onCameraAction?.('fit-all'), unsubs);
  bindClick(VIEWER_UI_IDS.fitViewbar, () => onCameraAction?.('fit-all'), unsubs);

  queryAll('[data-view]').forEach((button) => {
    const onClick = () => onCameraAction?.('set-view', button.getAttribute('data-view'));
    button.addEventListener('click', onClick);
    unsubs.push(() => button.removeEventListener('click', onClick));
  });

  const toolMap = [
    [VIEWER_UI_IDS.toolLine, 'line', () => onShowHudLineMode?.()],
    [VIEWER_UI_IDS.toolPolyline, 'polyline', () => onShowHudPolylineMode?.()],
    [VIEWER_UI_IDS.toolSpline, 'spline', () => onShowHudSplineMode?.()],
    [VIEWER_UI_IDS.toolValve, 'valve', () => onShowHudInsertMode?.('VALVE')],
    [VIEWER_UI_IDS.toolFlange, 'flange', () => onShowHudInsertMode?.('FLANGE')],
    [VIEWER_UI_IDS.toolTee, 'tee', () => onShowHudInsertMode?.('TEE')],
    [VIEWER_UI_IDS.toolSupport, 'support', () => onShowHudInsertMode?.('SUPPORT')],
    [VIEWER_UI_IDS.toolMove, 'move', () => onActivateModifyTool?.('MOVE')],
    [VIEWER_UI_IDS.toolStretch, 'stretch', () => onActivateModifyTool?.('STRETCH')],
    [VIEWER_UI_IDS.toolRotate, 'rotate', () => onActivateModifyTool?.('ROTATE')],
    [VIEWER_UI_IDS.toolBreak, 'break', () => onActivateModifyTool?.('BREAK')],
    [VIEWER_UI_IDS.toolDelete, 'delete', () => onActivateModifyTool?.('DELETE')],
  ];

  toolMap.forEach(([id, tool, handler]) => {
    bindClick(id, () => {
      store.dispatch({ type: VIEWER_UI_ACTIONS.setActiveTool, tool });
      handler?.();
    }, unsubs);
  });

  bindClick(VIEWER_UI_IDS.convertBend, () => onAutoBend?.(), unsubs);
  bindClick(VIEWER_UI_IDS.convertTee, () => onAutoTee?.(), unsubs);

  bindClick(VIEWER_UI_IDS.macroToggle, () => {
    const current = store.getState();
    const nextOpen = !Boolean(current.panelVisibility?.macro);
    store.dispatch({ type: VIEWER_UI_ACTIONS.setPanelVisibility, panelKey: 'macro', open: nextOpen });
    onPanelChange?.('macro', nextOpen);
  }, unsubs);

  bindClick(VIEWER_UI_IDS.leftPaletteToggle, () => {
    const current = store.getState();
    const currentlyOpen = current.panelVisibility?.leftPalette !== false;
    const nextOpen = !currentlyOpen;
    store.dispatch({ type: VIEWER_UI_ACTIONS.setPanelVisibility, panelKey: 'leftPalette', open: nextOpen });
    onPanelChange?.('leftPalette', nextOpen);
  }, unsubs);

  bindClick(VIEWER_UI_IDS.rightViewbarToggle, () => {
    const current = store.getState();
    const currentlyOpen = current.panelVisibility?.rightViewbar !== false;
    const nextOpen = !currentlyOpen;
    store.dispatch({ type: VIEWER_UI_ACTIONS.setPanelVisibility, panelKey: 'rightViewbar', open: nextOpen });
    onPanelChange?.('rightViewbar', nextOpen);
  }, unsubs);

  bindClick(VIEWER_UI_IDS.inspectorToggle, () => {
    const current = store.getState();
    const currentlyOpen = current.panelVisibility?.inspector !== false;
    const nextOpen = !currentlyOpen;
    store.dispatch({ type: VIEWER_UI_ACTIONS.setPanelVisibility, panelKey: 'inspector', open: nextOpen });
    onPanelChange?.('inspector', nextOpen);
  }, unsubs);

  const unsubscribeStore = store.subscribe((state) => {
    updateModeButtons(state);
    updateToolButtons(state);
    updateMacroTray(state);
    updatePanelChrome(state);
  });

  updateModeButtons(store.getState());
  updateToolButtons(store.getState());
  updateMacroTray(store.getState());
  updatePanelChrome(store.getState());

  return {
    setSelectedComponent(componentId) {
      store.dispatch({ type: VIEWER_UI_ACTIONS.setSelectedComponentId, componentId });
      onSelect?.(componentId || null);
    },
    destroy() {
      unsubscribeStore?.();
      unsubs.forEach((fn) => {
        try {
          fn?.();
        } catch (_) {}
      });
    },
  };
}
