import { capabilities } from '../capabilities/capability-registry.js';
import { appLogger } from '../debug/logger.js';

function byId(id) {
  return document.getElementById(id);
}

function bindClick(id, handler) {
  const el = byId(id);
  if (!el || typeof handler !== 'function') return () => {};

  const wrapped = async (ev) => {
    try {
      await handler(ev);
    } catch (err) {
      appLogger.error('TOOLBAR_ACTION_FAILED', {
        id,
        message: String(err?.message || err),
      });
    }
  };

  el.addEventListener('click', wrapped);
  return () => el.removeEventListener('click', wrapped);
}

function bindChange(id, handler) {
  const el = byId(id);
  if (!el || typeof handler !== 'function') return () => {};

  const wrapped = async (ev) => {
    try {
      await handler(ev);
    } catch (err) {
      appLogger.error('TOOLBAR_CHANGE_FAILED', {
        id,
        message: String(err?.message || err),
      });
    }
  };

  el.addEventListener('change', wrapped);
  return () => el.removeEventListener('change', wrapped);
}


function ensureMasterDbButton() {
  let el = byId('btn-masterdb');
  if (el) return el;
  const toolbar = document.querySelector('.viewer-toolbar');
  if (!toolbar) return null;
  const sep = document.createElement('span');
  sep.className = 'sep';
  el = document.createElement('button');
  el.id = 'btn-masterdb';
  el.title = 'Open Master DB';
  el.textContent = '🗂 Master DB';
  toolbar.insertBefore(sep, byId('viewer-status'));
  toolbar.insertBefore(el, byId('viewer-status'));
  return el;
}

function applyToolbarGrouping() {
  const toolbar = document.querySelector('.viewer-toolbar');
  if (!toolbar || toolbar.querySelector('.viewer-toolbar-group')) return;
  const isDev = Boolean(globalThis.window?.__GLB_PCF_DEV__);
  toolbar.classList.add('viewer-toolbar--grouped');
  if (isDev) toolbar.classList.add('viewer-toolbar--dev');
  const nodes = [...toolbar.children];
  let group = null;
  nodes.forEach((node) => {
    if (node.id === 'viewer-status') { group = null; return; }
    if (node.classList?.contains('sep')) { group = null; node.remove(); return; }
    if (!isDev && (node.classList?.contains('cap-chip') || node.classList?.contains('btn-mock'))) { node.remove(); return; }
    if (!group) {
      group = document.createElement('div');
      group.className = 'viewer-toolbar-group';
      toolbar.insertBefore(group, node);
    }
    group.appendChild(node);
  });
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function normalizeActions(actionsOrRenderer, _getComponents, _getDomain, shellApi) {
  const looksLikeRenderer = Boolean(
    actionsOrRenderer &&
    typeof actionsOrRenderer === 'object' &&
    typeof actionsOrRenderer.setView === 'function' &&
    typeof actionsOrRenderer.fitAll === 'function' &&
    typeof actionsOrRenderer.exportGLB === 'function' &&
    !actionsOrRenderer.openTextModel
  );

  if (looksLikeRenderer && shellApi) {
    return {
      openTextModel: shellApi.openTextModel,
      openGLBFile: shellApi.openGLBFile,
      setView: (preset) => actionsOrRenderer?.setView?.(preset),
      fitAll: () => actionsOrRenderer?.fitAll?.(),
      setHeatmap: (field) => actionsOrRenderer?.setHeatmap?.(field, shellApi.getComponents?.() || []),
      setLabelsVisible: (visible) => actionsOrRenderer?.setLabelsVisible?.(visible),
      setTheme: (theme) => actionsOrRenderer?.setTheme?.(theme),
      exportGLB: () => actionsOrRenderer?.exportGLB?.(),
      exportDXF: () => {},
      openMasterDb: () => shellApi.openMasterDb?.(),
      showHudLineMode: () => shellApi.showHudLineMode?.(),
      showHudPolylineMode: () => shellApi.showHudPolylineMode?.(),
      showHudSplineMode: () => shellApi.showHudSplineMode?.(),
      showHudInsertMode: (component) => shellApi.showHudInsertMode?.(component),
      activateModifyTool: (tool) => shellApi.activateModifyTool?.(tool),
      autoBend: () => shellApi.autoBendRoute?.({ source: 'toolbar-auto-bend' }),
      autoTee: () => shellApi.autoTeeRoute?.({ source: 'toolbar-auto-tee' }),
      setStatus: (tone, text) => shellApi.setViewerStatus?.(text, tone),
    };
  }
  return actionsOrRenderer || {};
}

export function initToolbar(actionsOrRenderer = {}, getComponents, getDomain, shellApi) {
  const actions = normalizeActions(actionsOrRenderer, getComponents, getDomain, shellApi);
  const unsubs = [];
  const pcfInput = byId('viewer-pcf-input');
  const glbInput = byId('viewer-glb-input');

  unsubs.push(bindClick('btn-viewer-open-pcf', () => pcfInput?.click()));
  unsubs.push(bindClick('btn-viewer-open-glb', () => glbInput?.click()));

  unsubs.push(bindChange('viewer-pcf-input', async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    actions.setStatus?.('active', `Opening ${file.name}...`);
    const text = await readTextFile(file);
    await actions.openTextModel?.(text, file.name);
    ev.target.value = '';
  }));

  unsubs.push(bindChange('viewer-glb-input', async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    actions.setStatus?.('active', `Opening ${file.name}...`);
    await actions.openGLBFile?.(file);
    ev.target.value = '';
  }));

  document.querySelectorAll('[data-view]').forEach((btn) => {
    const wrapped = () => actions.setView?.(btn.dataset.view);
    btn.addEventListener('click', wrapped);
    unsubs.push(() => btn.removeEventListener('click', wrapped));
  });

  unsubs.push(bindClick('btn-fit-all', () => actions.fitAll?.()));
  unsubs.push(bindClick('btn-fit-all-float', () => actions.fitAll?.()));
  unsubs.push(bindClick('btn-export-glb', () => actions.exportGLB?.()));
  unsubs.push(bindClick('btn-export-dxf', () => actions.exportDXF?.()));
  ensureMasterDbButton();
  applyToolbarGrouping();
  unsubs.push(bindClick('btn-masterdb', () => actions.openMasterDb?.()));
  unsubs.push(bindClick('btn-tool-line', () => actions.showHudLineMode?.()));
  unsubs.push(bindClick('btn-tool-polyline', () => actions.showHudPolylineMode?.()));
  unsubs.push(bindClick('btn-tool-spline', () => actions.showHudSplineMode?.()));
  unsubs.push(bindClick('btn-tool-valve', () => actions.showHudInsertMode?.('VALVE')));
  unsubs.push(bindClick('btn-tool-flange', () => actions.showHudInsertMode?.('FLANGE')));
  unsubs.push(bindClick('btn-tool-tee', () => actions.showHudInsertMode?.('TEE')));
  unsubs.push(bindClick('btn-tool-support', () => actions.showHudInsertMode?.('SUPPORT')));
  unsubs.push(bindClick('btn-tool-move', () => actions.activateModifyTool?.('MOVE')));
  unsubs.push(bindClick('btn-tool-stretch', () => actions.activateModifyTool?.('STRETCH')));
  unsubs.push(bindClick('btn-tool-rotate', () => actions.activateModifyTool?.('ROTATE')));
  unsubs.push(bindClick('btn-tool-break', () => actions.activateModifyTool?.('BREAK')));
  unsubs.push(bindClick('btn-tool-delete', () => actions.activateModifyTool?.('DELETE')));
  unsubs.push(bindClick('btn-convert-bend', () => actions.autoBend?.()));
  unsubs.push(bindClick('btn-convert-tee', () => actions.autoTee?.()));

  unsubs.push(bindChange('viewer-heatmap', (ev) => actions.setHeatmap?.(ev.target?.value || 'none')));
  unsubs.push(bindChange('viewer-labels-toggle', (ev) => actions.setLabelsVisible?.(Boolean(ev.target?.checked))));
  unsubs.push(bindChange('viewer-theme', (ev) => actions.setTheme?.(ev.target?.value || 'NavisDark')));

  capabilities.ready('theme');
  capabilities.ready('glb-load');
  capabilities.ready('glb-export');

  // Floating nav dragging
  const floatNav = byId('floating-nav');
  const dragHandle = floatNav?.querySelector('.nav-drag-handle');
  if (floatNav && dragHandle) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      floatNav.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const style = window.getComputedStyle(floatNav);
      const matrix = new DOMMatrixReadOnly(style.transform);
      initialX = matrix.m41;
      initialY = matrix.m42;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }


  return {
    destroy() {
      unsubs.forEach((fn) => {
        try { fn?.(); } catch (_) {}
      });
    },
  };
}
