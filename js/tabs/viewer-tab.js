import { SceneRenderer } from '../renderer/scene-renderer.js';
import { renderPanel, clearPanel } from '../ui/component-panel.js';
import { exportToDXF, exportCegToDXF } from '../glb/exportToDXF.js';
import { uxmlToCeg, looksLikeUxml, exportCegToUXML } from '../../formats/uxml/ceg-uxml-bridge.js';
import { getActiveDomain } from '../../core/domain-registry.js';
import { emit } from '../../core/event-bus.js';
import { appLogger } from '../debug/logger.js';
import { createRouteEngine } from '../../editor/route-engine.js';
import { createCommand } from '../../editor/command-types.js';
import { createHudOrchestrator } from '../../hud/hud-orchestrator.js';
import { createMasterDbStore } from '../../data/masterdb-store.js';
import { createMasterDbResolver } from '../../data/masterdb-resolver.js';
import { createMasterDbPopup } from '../../data/masterdb-popup.js';
import { initMacroTerminal } from '../../macro/macro-terminal.js';
import { initViewerUiBindings } from '../ui/viewer-ui-bindings.js';
import { createViewerUiStore, VIEWER_UI_ACTIONS, VIEWER_UI_MODES } from '../ui/viewer-ui-state.js';
import { VIEWER_UI_IDS, byId } from '../ui/viewer-ui-contract.js';
import { buildRouteRenderSnapshot, diffRouteRenderSnapshot, summarizeRouteRenderDiff } from '../renderer/route-render-reconciler.js';

let _sceneRenderer = null;
let _components = [];
let _selectedComponentId = null;
let _selectedComponent = null;
let _lastLoadMeta = null;
let _resizeObserver = null;
let _viewerUiStore = null;
let _viewerUiBindings = null;
let _routeEngine = null;
let _hudApi = null;
let _masterDbStore = null;
let _masterDbResolver = null;
let _masterDbPopup = null;
let _macroTerminalApi = null;
let _cegGraph = null;
let _knownRouteCompIds = new Set();
let _routeRenderSnapshot = new Map();
let _autoFitEnabled = false;

function _exposeSceneRenderer(renderer) { if (typeof window !== 'undefined') window._sceneRenderer = renderer; }
function getDomain() { return getActiveDomain(); }
function getComponents() { return _components; }
function getSelectedComponent() { return _selectedComponent; }
function getLastLoadMeta() { return _lastLoadMeta; }
function getRouteEngine() { return _routeEngine; }
function getSceneComponents() { return [..._components, ...(_routeEngine?.getDerivedComponents?.() || [])]; }
function getEditorState() { return _routeEngine?.getState?.() || null; }
function setViewerStatus(text, tone = 'idle') {
  const viewerStatus = byId(VIEWER_UI_IDS.statusInline);
  const statusDot = byId(VIEWER_UI_IDS.statusDot);
  const statusText = byId(VIEWER_UI_IDS.statusText);
  const msg = text || 'Ready';
  if (viewerStatus) viewerStatus.textContent = msg;
  if (statusText) statusText.textContent = msg;
  if (statusDot) {
    statusDot.classList.remove('idle', 'active', 'ok', 'error');
    statusDot.classList.add('hifi-status-dot', tone || 'idle');
  }
}
function setComponents(next) {
  _components = Array.isArray(next) ? next : [];
  return _components;
}
function appendComponent(comp) {
  if (!comp) return _components;
  _components = [..._components, comp];
  return _components;
}
function appendComponents(comps) {
  const add = Array.isArray(comps) ? comps.filter(Boolean) : [];
  if (!add.length) return _components;
  _components = [..._components, ...add];
  return _components;
}
function getMasterDbSummary() {
  const state = _masterDbStore?.getState?.() || null;
  return state ? {
    rowCount: (state.rows || []).length,
    open: Boolean(state.open),
    dirty: Boolean(state.dirty),
    lastResolution: state.lastResolution || null,
  } : null;
}
function buildLoadMeta(reason = 'refresh-scene', meta = {}) {
  const routeMetrics = _routeEngine?.getMetrics?.() || { routeCount: 0, totalLength: 0, perRoute: [] };
  return {
    components: getSceneComponents(),
    domain: getDomain(),
    reason,
    sourceName: meta.sourceName || reason,
    sourceType: meta.sourceType || null,
    selectedId: _selectedComponentId,
    loadedAt: Date.now(),
    routeMetrics,
    routeCount: routeMetrics.routeCount || 0,
    editorState: _routeEngine?.getState?.() || null,
    hudState: _hudApi?.getState?.() || null,
    masterDb: getMasterDbSummary(),
  };
}
function refreshScene(reason = 'refresh-scene', meta = {}) {
  const domain = getDomain();
  if (!_sceneRenderer || !domain) return;
  _sceneRenderer.loadComponents(getSceneComponents(), domain, _autoFitEnabled);
  const routeDerived = _routeEngine?.getDerivedComponents?.() || [];
  _knownRouteCompIds = new Set(routeDerived.map(c => c.id));
  _routeRenderSnapshot = buildRouteRenderSnapshot(routeDerived);
  _lastLoadMeta = buildLoadMeta(reason, meta);
  emit('model-loaded', _lastLoadMeta);
}
function setViewerMode(mode) {
  if (!_viewerUiStore) return;
  if (mode !== VIEWER_UI_MODES.draft2d && mode !== VIEWER_UI_MODES.stick && mode !== VIEWER_UI_MODES.mode3d) throw new Error(`Unsupported viewer mode: ${mode}`);
  _viewerUiStore.dispatch({ type: VIEWER_UI_ACTIONS.setActiveMode, mode });
  _sceneRenderer?.applyVisualProfile?.(mode);
}
function openComponentPanel(component) {
  const sidePanel = byId(VIEWER_UI_IDS.inspector);
  if (!sidePanel) return;
  if (!component) { clearPanel(sidePanel); return; }
  const domain = getDomain();
  renderPanel(domain?.getInfoPanelSections?.(component) || [], sidePanel);
}
function selectComponent(component, mesh = null, reason = 'select-component') {
  _selectedComponent = component || null;
  _selectedComponentId = component?.id || null;
  _viewerUiStore?.dispatch({ type: VIEWER_UI_ACTIONS.setSelectedComponentId, componentId: _selectedComponentId });
  _sceneRenderer?.highlight(mesh || null);
  openComponentPanel(component || null);
  emit('component-selected', { id: _selectedComponentId, comp: _selectedComponent, component: _selectedComponent, mesh: mesh || null, reason, at: Date.now() });
}
function handleScenePick(ev) {
  if (!_sceneRenderer) return;
  if (ev.target?.closest?.('.hud-overlay')) return;
  const hudMode = _hudApi?.getState?.()?.mode;
  if (hudMode && hudMode !== 'idle') return;
  const container = byId(VIEWER_UI_IDS.canvas);
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  const hit = _sceneRenderer.pick(ndcX, ndcY);
  if (!hit?.comp) { selectComponent(null, null, 'pick-empty'); return; }
  selectComponent(hit.comp, hit.mesh, 'pick');
}
async function openTextModel(text, sourceName = 'text-model') {
  const domain = getDomain();
  if (!domain) throw new Error('No active domain registered');
  setViewerStatus(`Loading ${sourceName}...`, 'active');
  appLogger.info('VIEWER_TAB_OPEN_TEXT_START', { sourceName });
  try {
    const lowerName = String(sourceName || '').toLowerCase();
    const isDxf = lowerName.endsWith('.dxf');
    const isUxml = lowerName.endsWith('.uxml') || (lowerName.endsWith('.xml') && looksLikeUxml(text));
    let components;
    if (isUxml) {
      const result = uxmlToCeg(text, { name: sourceName });
      components = result.components;
      _cegGraph  = result.ceg;
      if (typeof window !== 'undefined') window.__cegGraph = _cegGraph;
      appLogger.info('VIEWER_TAB_UXML_IMPORT', { sourceName, ...result.enrichment });
    } else if (isDxf && typeof domain.parseDxfWithCeg === 'function') {
      const result = domain.parseDxfWithCeg(text, appLogger);
      components = result.components;
      _cegGraph  = result.ceg;
      if (typeof window !== 'undefined') window.__cegGraph = _cegGraph;
    } else {
      components = domain.parse(text, sourceName, appLogger);
      _cegGraph  = null;
      if (typeof window !== 'undefined') window.__cegGraph = null;
    }
    setComponents(components);
    setViewerMode(VIEWER_UI_MODES.draft2d);
    refreshScene('file-import', { sourceName, sourceType: isUxml ? 'uxml' : (isDxf ? 'dxf' : 'text') });
    selectComponent(null, null, 'file-import');
    setViewerStatus(`${components.length} components loaded`, 'ok');
    appLogger.info('VIEWER_TAB_OPEN_TEXT_DONE', { sourceName, componentCount: components.length });
    return components;
  } catch (err) {
    setViewerStatus(`Load failed: ${sourceName}`, 'error');
    appLogger.error('VIEWER_TAB_OPEN_TEXT_FAIL', { sourceName, message: String(err?.message || err) });
    throw err;
  }
}
async function openGLBFile(file) {
  if (!_sceneRenderer) throw new Error('SceneRenderer not initialized');
  if (!file) throw new Error('No GLB file provided');
  const url = URL.createObjectURL(file);
  setViewerStatus(`Loading ${file.name}...`, 'active');
  appLogger.info('VIEWER_TAB_OPEN_GLB_START', { sourceName: file.name });
  try {
    await _sceneRenderer.loadGLB(url);
    setViewerMode(VIEWER_UI_MODES.mode3d);
    setComponents([]);
    selectComponent(null, null, 'glb-import');
    _lastLoadMeta = buildLoadMeta('glb-import', { sourceName: file.name, sourceType: 'glb' });
    emit('model-loaded', _lastLoadMeta);
    setViewerStatus(`GLB loaded: ${file.name}`, 'ok');
    appLogger.info('VIEWER_TAB_OPEN_GLB_DONE', { sourceName: file.name });
  } catch (err) {
    setViewerStatus(`GLB load failed: ${file.name}`, 'error');
    appLogger.error('VIEWER_TAB_OPEN_GLB_FAIL', { sourceName: file.name, message: String(err?.message || err) });
    throw err;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function buildViewerUiBindingsConfig() {
  return {
    store: _viewerUiStore,
    onOpenTextModel: openTextModel,
    onOpenGlbFile: openGLBFile,
    onModeChange: (mode) => setViewerMode(mode),
    onToggleLineDiagram: (enabled) => setViewerMode(enabled ? VIEWER_UI_MODES.stick : VIEWER_UI_MODES.draft2d),
    onCameraAction: (action, payload) => {
      if (action === 'fit-all') _sceneRenderer?.fitAll?.();
      if (action === 'set-view') _sceneRenderer?.setView?.(payload);
    },
    onHeatmapChange: (field) => _sceneRenderer?.setHeatmap?.(field || 'none', getSceneComponents()),
    onLabelsVisibleChange: (visible) => _sceneRenderer?.setLabelsVisible?.(Boolean(visible)),
    onThemeChange: (theme) => _sceneRenderer?.setTheme?.(theme || 'NavisDark'),
    onExportGlb: async () => _sceneRenderer?.exportGLB?.(),
    onExportDxf: () => { if (_cegGraph) exportCegToDXF(_cegGraph, 'scene-ceg.dxf'); else exportToDXF(getSceneComponents(), 'scene.dxf'); },
    onExportUxml: () => { if (_cegGraph) exportCegToUXML(_cegGraph, 'scene.uxml'); else setViewerStatus('Export UXML needs a CEG model (open a DXF or UXML first)', 'error'); },
    onOpenMasterDb: () => _masterDbPopup?.open?.(),
    onShowHudLineMode: () => _hudApi?.showLineMode?.(),
    onShowHudPolylineMode: () => _hudApi?.showPolylineMode?.(),
    onShowHudSplineMode: () => _hudApi?.showSplineMode?.(),
    onShowHudCircleMode: () => _hudApi?.showCircleMode?.(),
    onShowHudArcMode: () => _hudApi?.showArcMode?.(),
    onShowHudInsertMode: (component) => _hudApi?.showInsertMode?.(component),
    onActivateModifyTool: (tool) => _hudApi?.activateModifyTool?.(tool),
    onAutoBend: () => autoBendRoute({ source: 'toolbar-auto-bend' }),
    onAutoTee: () => autoTeeRoute({ source: 'toolbar-auto-tee' }),
    onPanelChange: (panelKey, open) => {
      const tone = open ? 'active' : 'idle';
      if (panelKey === 'macro') { setViewerStatus(open ? 'Macro tray open' : 'Macro tray closed', tone); return; }
      if (panelKey === 'inspector') { setViewerStatus(open ? 'Inspector open' : 'Inspector collapsed', tone); return; }
      if (panelKey === 'leftPalette') { setViewerStatus(open ? 'Left tools expanded' : 'Left tools collapsed', tone); return; }
      if (panelKey === 'rightViewbar') setViewerStatus(open ? 'View bar expanded' : 'View bar collapsed', tone);
    },
    onSelect: (componentId) => {
      if (_selectedComponentId === componentId) return;
      _viewerUiStore?.dispatch({ type: VIEWER_UI_ACTIONS.setSelectedComponentId, componentId: componentId || null });
    },
  };
}
function getSelectedRouteRef() {
  const attrs = _selectedComponent?.attributes || {};
  return {
    routeId: attrs.ROUTE_ID || attrs['ROUTE_ID'] || _routeEngine?.getActiveRoute?.()?.id || null,
    segmentId: attrs.SEGMENT_ID || attrs['SEGMENT_ID'] || null,
  };
}
function resolveAutoBendCandidate() {
  if (!_routeEngine) return null;
  const ref = getSelectedRouteRef();
  const route = _routeEngine.getRoutes?.().find((item) => item.id === ref.routeId) || _routeEngine.getActiveRoute?.() || null;
  if (!route) return null;
  if (ref.segmentId) {
    const segIndex = (route.segments || []).findIndex((seg) => seg.id === ref.segmentId);
    const fromNodeId = segIndex >= 0 ? route.segments[segIndex].from : null;
    const toNodeId = segIndex >= 0 ? route.segments[segIndex].to : null;
    return _routeEngine.getAutoBendCandidate?.(route.id, toNodeId)
      || _routeEngine.getAutoBendCandidate?.(route.id, fromNodeId)
      || _routeEngine.getAutoBendCandidate?.(route.id, null);
  }
  return _routeEngine.getAutoBendCandidate?.(route.id, null);
}
function autoBendRoute(meta = {}) {
  if (!_routeEngine) throw new Error('Route engine not initialized');
  const candidate = resolveAutoBendCandidate();
  if (!candidate) throw new Error('No bend conversion candidate found');
  const route = _routeEngine.getRoutes?.().find((item) => item.id === candidate.routeId) || _routeEngine.getActiveRoute?.() || null;
  const query = { component: 'ELBOW', subtype: 'LR', size: candidate.size || route?.spec?.size || '', rating: candidate.rating || route?.spec?.rating || '', angle: candidate.angle };
  const result = _masterDbResolver?.resolveComponent?.(query) || null;
  const list = _routeEngine.autoBend({
    routeId: candidate.routeId,
    nodeId: candidate.nodeId,
    resolved: result?.resolved || {},
    provenance: result?.source || 'manual',
    matchKey: result?.matchKey || '',
  }, { source: meta.source || 'viewer-auto-bend' });
  refreshScene('auto-bend', { sourceName: 'auto-bend', sourceType: 'route' });
  const inserted = Array.isArray(list) ? list.find((item) => item.id === `route:${candidate.routeId}:auto-bend:${candidate.nodeId}`) || list[list.length - 1] : null;
  if (inserted) selectComponent(inserted, null, 'auto-bend');
  emit('debug:trace', { scope: 'viewer', event: 'AUTO_BEND', ok: true, timestamp: Date.now(), details: { candidate, result } });
  setViewerStatus('Auto Bend converted', 'ok');
  return inserted;
}
function autoTeeRoute(meta = {}) {
  if (!_routeEngine) throw new Error('Route engine not initialized');
  const ref = getSelectedRouteRef();
  const candidate = _routeEngine.getAutoTeeCandidate?.(ref.routeId, null) || _routeEngine.getAutoTeeCandidate?.(null, null);
  if (!candidate) throw new Error('No tee conversion candidate found');
  const query = { component: 'TEE', subtype: candidate.subtype || 'EQUAL', size: candidate.runSize || '', branchSize: candidate.branchSize || candidate.runSize || '', rating: candidate.rating || '' };
  const result = _masterDbResolver?.resolveComponent?.(query) || null;
  const list = _routeEngine.autoTee({
    routeId: candidate.routeId,
    nodeId: candidate.nodeId,
    candidate,
    resolved: result?.resolved || {},
    provenance: result?.source || 'manual',
    matchKey: result?.matchKey || '',
  }, { source: meta.source || 'viewer-auto-tee' });
  refreshScene('auto-tee', { sourceName: 'auto-tee', sourceType: 'route' });
  const inserted = Array.isArray(list) ? list.find((item) => item.id === `route:${candidate.routeId}:auto-tee:${candidate.nodeId}`) || list[list.length - 1] : null;
  if (inserted) selectComponent(inserted, null, 'auto-tee');
  emit('debug:trace', { scope: 'viewer', event: 'AUTO_TEE', ok: true, timestamp: Date.now(), details: { candidate, result } });
  setViewerStatus('Auto Tee converted', 'ok');
  return inserted;
}
function destroyViewerTab() {
  const container = byId(VIEWER_UI_IDS.canvas);
  if (container) container.removeEventListener('click', handleScenePick);
  if (_resizeObserver && container) _resizeObserver.unobserve(container);
  if (_resizeObserver) _resizeObserver.disconnect();
  _resizeObserver = null;
  _viewerUiBindings?.destroy?.();
  _viewerUiBindings = null;
  _viewerUiStore = null;
  _hudApi?.destroy?.();
  _hudApi = null;
  _masterDbPopup?.destroy?.();
  _masterDbPopup = null;
  _macroTerminalApi?.host?.remove?.();
  _macroTerminalApi = null;
  _masterDbResolver = null;
  _masterDbStore = null;
  _routeEngine = null;
  _sceneRenderer?.dispose?.();
  _sceneRenderer = null;
  _cegGraph = null;
  _autoFitEnabled = false;
  _knownRouteCompIds = new Set();
  _routeRenderSnapshot = new Map();
  if (typeof window !== 'undefined') {
    window._sceneRenderer = null;
    window.__viewerShell  = null;
    window.__viewerTab    = null;
    window.__routeEngine  = null;
    window.__hudApi       = null;
    window.__cegGraph     = null;
  }
}
export function getViewerShellApi() {
  return {
    get renderer() { return _sceneRenderer; },
    getCegGraph: () => _cegGraph,
    getComponents,
    getSceneComponents,
    getDomain,
    getSelectedComponent,
    getLastLoadMeta,
    getRouteEngine,
    getEditorState,
    setComponents,
    appendComponent,
    appendComponents,
    refreshScene,
    selectComponent,
    openTextModel,
    openGLBFile,
    setViewerStatus,
    executeEditorCommand: (command) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.execute(command);
    },
    startRouteAt: (point, spec = {}, meta = {}) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.startRoute(point, spec, meta);
    },
    addRouteDelta: (payload, meta = {}) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.addSegment(payload, meta);
    },
    addRouteToPoint: (routeId, point, meta = {}) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.addToPoint(routeId, point, meta);
    },
    riseRoute: (lengthMm, routeId = null, meta = {}) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.rise(lengthMm, routeId, meta);
    },
    dropRoute: (lengthMm, routeId = null, meta = {}) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.drop(lengthMm, routeId, meta);
    },
    insertRouteComponent: (payload, meta = {}) => {
      if (!_routeEngine) throw new Error('Route engine not initialized');
      return _routeEngine.insertComponent(payload, meta);
    },
    autoBendRoute,
    autoTeeRoute,
    createEditorCommand: (type, payload = {}, meta = {}) => createCommand(type, payload, meta),
    fitAll: () => _sceneRenderer?.fitAll?.(),
    setView: (preset) => _sceneRenderer?.setView?.(preset),
    getHudState: () => _hudApi?.getState?.() || null,
    showHudLineMode: () => _hudApi?.showLineMode?.(),
    showHudPolylineMode: () => _hudApi?.showPolylineMode?.(),
    showHudSplineMode: () => _hudApi?.showSplineMode?.(),
    showHudInsertMode: (component) => _hudApi?.showInsertMode?.(component),
    activateModifyTool: (tool) => _hudApi?.activateModifyTool?.(tool),
    getMasterDbState: () => _masterDbStore?.getState?.() || null,
    openMasterDb: () => _masterDbPopup?.open?.(),
    closeMasterDb: () => _masterDbPopup?.close?.(),
    resolveComponent: (query) => {
      const result = _masterDbResolver?.resolveComponent?.(query) || null;
      emit('debug:trace', { scope: 'masterdb', event: 'RESOLVE_COMPONENT', ok: Boolean(result?.ok), timestamp: Date.now(), details: { query, result } });
      return result;
    },
    getLastResolverResult: () => _masterDbStore?.getState?.()?.lastResolution || null,
    destroy: destroyViewerTab,
  };
}
export function initViewerTab() {
  const container = byId(VIEWER_UI_IDS.canvas);
  const sidePanel = byId(VIEWER_UI_IDS.inspector);
  if (!container) { console.warn('[viewer-tab] Missing viewer canvas container'); return; }
  _sceneRenderer = new SceneRenderer(container);
  _routeEngine = createRouteEngine();
  _masterDbStore = createMasterDbStore();
  _masterDbResolver = createMasterDbResolver(_masterDbStore);
  _masterDbPopup = createMasterDbPopup({ store: _masterDbStore, container: document.body });
  _masterDbStore.subscribe((state) => {
    emit('debug:trace', { scope: 'masterdb', event: 'STATE_CHANGE', ok: true, timestamp: Date.now(), details: { rowCount: (state.rows || []).length, open: Boolean(state.open), dirty: Boolean(state.dirty), lastResolution: state.lastResolution || null } });
  });
  _routeEngine.subscribe(() => {
    const domain = getDomain();
    if (!_sceneRenderer || !domain) return;
    const allDerived = _routeEngine?.getDerivedComponents?.() || [];
    const diff = diffRouteRenderSnapshot(_routeRenderSnapshot, allDerived);
    _routeRenderSnapshot = diff.nextSnapshot;
    _knownRouteCompIds = new Set(allDerived.map((comp) => comp.id));
    if (diff.changed) {
      const result = _sceneRenderer.reconcileComponents?.(diff, domain, { allComponents: getSceneComponents(), autoFit: _autoFitEnabled });
      if (!result) {
        refreshScene('route-engine-reconcile-fallback', { sourceName: 'route-engine', sourceType: 'route' });
        return;
      }
      emit('debug:trace', { scope: 'viewer', event: 'ROUTE_RENDER_RECONCILE', ok: true, timestamp: Date.now(), details: { diff: summarizeRouteRenderDiff(diff), result } });
    }
    _lastLoadMeta = buildLoadMeta('route-engine-reconcile', { sourceName: 'route-engine', sourceType: 'route', reconcile: summarizeRouteRenderDiff(diff) });
    emit('model-loaded', _lastLoadMeta);
  });
  _exposeSceneRenderer(_sceneRenderer);
  if (sidePanel) clearPanel(sidePanel);
  setViewerStatus('Viewer ready', 'idle');
  container.addEventListener('click', handleScenePick);
  _viewerUiStore = createViewerUiStore({
    activeMode: VIEWER_UI_MODES.draft2d,
    lineDiagramEnabled: false,
    panelVisibility: { leftPalette: true, rightViewbar: true, inspector: true, macro: false, hud: true },
    inspectorSection: 'component',
    selectedComponentId: null,
    theme: 'DraftLight',
  });
  _resizeObserver = new ResizeObserver(() => _sceneRenderer?.onResize());
  _resizeObserver.observe(container);
  _lastLoadMeta = buildLoadMeta('viewer-init', { sourceName: 'viewer-init', sourceType: 'shell' });
  emit('model-loaded', _lastLoadMeta);
  if (typeof window !== 'undefined') {
    window.__viewerShell = getViewerShellApi();
    window.__viewerTab = getViewerShellApi();
    window.__routeEngine = _routeEngine;
    window.__masterDbStore = _masterDbStore;
  }
  try {
    _hudApi = createHudOrchestrator({ container, shellApi: getViewerShellApi() });
    if (typeof window !== 'undefined') window.__hudApi = _hudApi;
  } catch (err) {
    appLogger.warn('VIEWER_TAB_HUD_INIT_WARN', { message: String(err?.message || err) });
  }
  try {
    _macroTerminalApi = initMacroTerminal({
      container: byId(VIEWER_UI_IDS.macroTray) || container,
      renderer: _sceneRenderer,
      getComponents,
      setComponents,
      getDomain,
      getRouteEngine,
      setStatus: (tone, text) => setViewerStatus(text, tone),
      refreshModel: () => refreshScene('macro-terminal', { sourceName: 'macro-terminal', sourceType: 'macro' }),
    });
    if (typeof window !== 'undefined') window.__macroTerminal = _macroTerminalApi;
  } catch (err) {
    appLogger.warn('VIEWER_TAB_MACRO_INIT_WARN', { message: String(err?.message || err) });
  }
  try {
    _viewerUiBindings = initViewerUiBindings(buildViewerUiBindingsConfig());
  } catch (err) {
    appLogger.warn('VIEWER_TAB_UI_BINDINGS_INIT_WARN', { message: String(err?.message || err) });
  }
  const themeSelect = byId(VIEWER_UI_IDS.theme);
  if (themeSelect?.value) {
    _sceneRenderer?.setTheme?.(themeSelect.value);
    _viewerUiStore?.dispatch({ type: VIEWER_UI_ACTIONS.setTheme, theme: themeSelect.value });
  }
  setViewerMode(VIEWER_UI_MODES.draft2d);
  const syncBtn = byId(VIEWER_UI_IDS.incrementalSync);
  if (syncBtn) {
    syncBtn.title = _autoFitEnabled
      ? 'Auto-Fit ON: View will automatically zoom to fit when geometry updates'
      : 'Auto-Fit OFF: View will not zoom when geometry updates';
    syncBtn.addEventListener('click', () => {
      _autoFitEnabled = !_autoFitEnabled;
      syncBtn.classList.toggle('active', _autoFitEnabled);
      syncBtn.title = _autoFitEnabled
        ? 'Auto-Fit ON: View will automatically zoom to fit when geometry updates'
        : 'Auto-Fit OFF: View will not zoom when geometry updates';
      setViewerStatus(_autoFitEnabled ? 'Auto-Fit enabled' : 'Auto-Fit disabled', _autoFitEnabled ? 'ok' : 'idle');
    });
  }
}
