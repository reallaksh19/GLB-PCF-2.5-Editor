import { emit } from '../core/event-bus.js';
import { initialHudState, createHudTrace } from './hud-contract.js';
import { createHudStore } from './hud-state.js';
import { createHudOverlay } from './hud-overlay.js';
import { installHudKeyboard } from './hud-keyboard.js';
import { computePreviewPoint, getActiveRouteAnchor, commitLineDraft } from './hud-line-draw.js';
import { getInsertDefaults, resolveInsertContext, commitInsertDraft } from './hud-component-insert.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function emitHudTrace(event, details = {}, ok = true) {
  emit('debug:trace', createHudTrace(event, details, ok));
}

function buildInitialLineDraft(shellApi, prev = {}) {
  const axis = String(prev.axis || 'X').toUpperCase();
  const sign = prev.sign < 0 ? -1 : 1;
  const anchorPoint = getActiveRouteAnchor(shellApi);
  const routeId = shellApi?.getRouteEngine?.()?.getActiveRoute?.()?.id || null;
  const lengthMm = Number(prev.lengthMm) > 0 ? Number(prev.lengthMm) : 1000;
  return {
    axis,
    sign,
    lengthMm,
    routeId,
    anchorPoint,
    previewPoint: computePreviewPoint(anchorPoint, axis, lengthMm, sign),
    size: prev.size || '',
    rating: prev.rating || '',
    pipelineRef: prev.pipelineRef || '',
  };
}

function mergeDraftField(draft, field, value) {
  const next = { ...(draft || {}) };
  if (field === 'lengthMm') next.lengthMm = Number(value);
  else if (field === 'axis') next.axis = String(value || 'X').toUpperCase().slice(0, 1);
  else next[field] = value;
  return next;
}

function resolveInsertDefaults(component, shellApi) {
  const base = getInsertDefaults(component, shellApi);
  return resolveInsertContext(base, shellApi)?.insertContext || base;
}

function updateInsertContextField(state, field, value, shellApi) {
  const insertContext = { ...(state.insertContext || {}), [field]: value };
  if (field === 'length' || field === 'weight') {
    insertContext.provenance = 'manual';
    insertContext.warnings = [];
    return insertContext;
  }
  return resolveInsertContext(insertContext, shellApi, { preserveManual: true })?.insertContext || insertContext;
}

export function createHudOrchestrator({ container, shellApi }) {
  if (!container) throw new Error('HUD requires a container');
  if (!shellApi) throw new Error('HUD requires shellApi');

  const store = createHudStore({ ...clone(initialHudState), visible: false, mode: 'idle', errors: [], lastLengthMm: null });
  const overlay = createHudOverlay(container, {
    open: () => store.patch({ visible: true, errors: [] }),
    hide: () => store.patch({ visible: false, errors: [], mode: 'idle' }),
    activateLine: () => {
      const nextDraft = buildInitialLineDraft(shellApi, store.getState().draft || {});
      store.patch({ visible: true, mode: 'line-draw', draft: nextDraft, errors: [] });
      emitHudTrace('LINE_MODE_OPEN', { axis: nextDraft.axis, routeId: nextDraft.routeId || null });
    },
    activateModify: (tool) => {
      // Modify modes: stretch, rotate, break, delete, polyline
      store.patch({ visible: true, mode: `modify-${tool}`, errors: [], activeTool: tool });
      emitHudTrace('MODIFY_MODE_OPEN', { tool });
    },
    activateInsert: (component) => {
      const ctx = resolveInsertDefaults(component, shellApi);
      store.patch({ visible: true, mode: 'insert-component', insertContext: ctx, provenance: ctx.provenance || 'default', errors: [] });
      emitHudTrace('INSERT_MODE_OPEN', { component: ctx.component, point: ctx.point, provenance: ctx.provenance || 'default', matchKey: ctx.resolvedMatchKey || null }, true);
    },
    cancel: () => {
      const state = store.getState();
      if (state.activeTool === 'polyline' && state.polylineRouteId) {
        // Discard the polyline on cancel
        try { shellApi.executeEditorCommand?.(shellApi.createEditorCommand?.('ROUTE_DELETE', { routeId: state.polylineRouteId })); } catch (_) {}
      }
      store.patch({ mode: 'idle', draft: null, insertContext: null, errors: [], visible: state.visible, activeTool: null, polylineRouteId: null });
      emitHudTrace('HUD_CANCEL', {}, true);
    },
    commitModify: () => {
      const state = store.getState();
      if (state.activeTool === 'polyline' && state.polylineRouteId) {
        try { shellApi.endPolyline?.(state.polylineRouteId); } catch (_) {}
        store.patch({ mode: 'idle', activeTool: null, polylineRouteId: null, errors: [] });
        emitHudTrace('POLYLINE_COMMIT', { routeId: state.polylineRouteId }, true);
      }
    },
    setAxis: (axis) => {
      const state = store.getState();
      if (state.mode !== 'line-draw') return;
      const draft = { ...(state.draft || {}), axis: String(axis || 'X').toUpperCase() };
      draft.previewPoint = computePreviewPoint(draft.anchorPoint, draft.axis, draft.lengthMm, draft.sign);
      store.patch({ draft, axisLock: draft.axis });
    },
    setSign: (sign) => {
      const state = store.getState();
      if (state.mode !== 'line-draw') return;
      const draft = { ...(state.draft || {}), sign: sign < 0 ? -1 : 1 };
      draft.previewPoint = computePreviewPoint(draft.anchorPoint, draft.axis, draft.lengthMm, draft.sign);
      store.patch({ draft });
    },
    updateField: (field, value) => {
      const state = store.getState();
      if (state.mode === 'line-draw') {
        const draft = mergeDraftField(state.draft, field, value);
        draft.previewPoint = computePreviewPoint(draft.anchorPoint, draft.axis, draft.lengthMm, draft.sign);
        store.patch({ draft, axisLock: draft.axis, errors: [] });
      } else if (state.mode === 'insert-component') {
        const insertContext = updateInsertContextField(state, field, value, shellApi);
        store.patch({ insertContext, provenance: insertContext.provenance || 'manual', errors: [] });
      } else {
        store.patch({ [field]: value });
      }
    },
    commitLine: () => {
      const state = store.getState();
      if (state.mode !== 'line-draw') return;
      try {
        const result = commitLineDraft(state, shellApi);
        const nextDraft = buildInitialLineDraft(shellApi, {
          ...(state.draft || {}),
          routeId: result.routeId,
          anchorPoint: result.anchorPoint,
          lengthMm: state.draft?.lengthMm,
        });
        nextDraft.previewPoint = result.previewPoint;
        store.patch({ visible: true, mode: 'line-draw', draft: nextDraft, lastLengthMm: result.lastLengthMm, errors: [] });
        emitHudTrace('LINE_COMMIT', { routeId: result.routeId, axis: nextDraft.axis, lengthMm: result.lastLengthMm }, true);
      } catch (err) {
        store.patch({ errors: [String(err?.message || err)] });
        emitHudTrace('LINE_COMMIT_FAIL', { message: String(err?.message || err) }, false);
      }
    },
    commitRise: () => {
      const state = store.getState();
      const draft = { ...(state.draft || {}), axis: 'Z', sign: 1 };
      draft.previewPoint = computePreviewPoint(draft.anchorPoint, 'Z', draft.lengthMm, 1);
      store.patch({ mode: 'line-draw', visible: true, draft, errors: [] });
      try {
        const result = commitLineDraft(store.getState(), shellApi);
        const nextDraft = buildInitialLineDraft(shellApi, { ...(store.getState().draft || {}), routeId: result.routeId, anchorPoint: result.anchorPoint, lengthMm: store.getState().draft?.lengthMm });
        nextDraft.previewPoint = result.previewPoint;
        store.patch({ draft: nextDraft, lastLengthMm: result.lastLengthMm, errors: [] });
        emitHudTrace('LINE_RISE_COMMIT', { routeId: result.routeId, lengthMm: result.lastLengthMm }, true);
      } catch (err) {
        store.patch({ errors: [String(err?.message || err)] });
        emitHudTrace('LINE_RISE_COMMIT_FAIL', { message: String(err?.message || err) }, false);
      }
    },
    commitDrop: () => {
      const state = store.getState();
      const draft = { ...(state.draft || {}), axis: 'Z', sign: -1 };
      draft.previewPoint = computePreviewPoint(draft.anchorPoint, 'Z', draft.lengthMm, -1);
      store.patch({ mode: 'line-draw', visible: true, draft, errors: [] });
      try {
        const result = commitLineDraft(store.getState(), shellApi);
        const nextDraft = buildInitialLineDraft(shellApi, { ...(store.getState().draft || {}), routeId: result.routeId, anchorPoint: result.anchorPoint, lengthMm: store.getState().draft?.lengthMm });
        nextDraft.previewPoint = result.previewPoint;
        store.patch({ draft: nextDraft, lastLengthMm: result.lastLengthMm, errors: [] });
        emitHudTrace('LINE_DROP_COMMIT', { routeId: result.routeId, lengthMm: result.lastLengthMm }, true);
      } catch (err) {
        store.patch({ errors: [String(err?.message || err)] });
        emitHudTrace('LINE_DROP_COMMIT_FAIL', { message: String(err?.message || err) }, false);
      }
    },
    commitInsert: () => {
      const state = store.getState();
      if (state.mode !== 'insert-component') return;
      try {
        const { payload, inserted } = commitInsertDraft(state.insertContext, shellApi);
        if (inserted) {
          setTimeout(() => {
            try { shellApi.selectComponent?.(inserted, null, 'hud-insert'); } catch (_) {}
          }, 0);
        }
        const nextCtx = resolveInsertDefaults(payload.component, shellApi);
        store.patch({ visible: true, mode: 'insert-component', insertContext: nextCtx, provenance: payload.provenance || 'manual', errors: [] });
        emitHudTrace('INSERT_COMMIT', { component: payload.component, subtype: payload.subtype, size: payload.size, rating: payload.rating, provenance: payload.provenance || 'manual', length: payload.length || '', weight: payload.weight || '' }, true);
      } catch (err) {
        store.patch({ errors: [String(err?.message || err)] });
        emitHudTrace('INSERT_COMMIT_FAIL', { message: String(err?.message || err) }, false);
      }
    },
    commitAutoBend: () => {
      try {
        const inserted = shellApi.autoBendRoute?.({ source: 'hud-auto-bend' });
        if (inserted) {
          setTimeout(() => { try { shellApi.selectComponent?.(inserted, null, 'hud-auto-bend'); } catch (_) {} }, 0);
        }
        store.patch({ errors: [] });
        emitHudTrace('AUTO_BEND_COMMIT', { insertedId: inserted?.id || null }, true);
      } catch (err) {
        store.patch({ errors: [String(err?.message || err)] });
        emitHudTrace('AUTO_BEND_COMMIT_FAIL', { message: String(err?.message || err) }, false);
      }
    },
    commitAutoTee: () => {
      try {
        const inserted = shellApi.autoTeeRoute?.({ source: 'hud-auto-tee' });
        if (inserted) {
          setTimeout(() => { try { shellApi.selectComponent?.(inserted, null, 'hud-auto-tee'); } catch (_) {} }, 0);
        }
        store.patch({ errors: [] });
        emitHudTrace('AUTO_TEE_COMMIT', { insertedId: inserted?.id || null }, true);
      } catch (err) {
        store.patch({ errors: [String(err?.message || err)] });
        emitHudTrace('AUTO_TEE_COMMIT_FAIL', { message: String(err?.message || err) }, false);
      }
    },
  });

  const unsubscribeRender = store.subscribe((state) => overlay.render(state));
  overlay.render(store.getState());

  const offKeyboard = installHudKeyboard(overlay.root, {
    line: () => overlay.root.querySelector('[data-action="line"]')?.click(),
    insert: (component) => {
      if (component === 'VALVE') overlay.root.querySelector('[data-action="insert-valve"]')?.click();
      if (component === 'FLANGE') overlay.root.querySelector('[data-action="insert-flange"]')?.click();
      if (component === 'ELBOW') overlay.root.querySelector('[data-action="insert-elbow"]')?.click();
      if (component === 'TEE') overlay.root.querySelector('[data-action="insert-tee"]')?.click();
      if (component === 'SUPPORT') overlay.root.querySelector('[data-action="insert-support"]')?.click();
      if (component === 'REDUCER') {
        overlay.root.querySelector('[data-action="insert-support"]')?.click();
        const state = store.getState();
        if (state.mode === 'insert-component') store.patch({ insertContext: resolveInsertDefaults('REDUCER', shellApi) });
      }
    },
    axis: (axis) => overlay.root.querySelector(`[data-action="axis"][data-axis="${axis}"]`)?.click(),
    sign: (sign) => overlay.root.querySelector(`[data-action="sign"][data-sign="${sign}"]`)?.click(),
    commit: () => {
      const state = store.getState();
      if (state.mode === 'line-draw') overlay.root.querySelector('[data-action="commit-line"]')?.click();
      else if (state.mode === 'insert-component') overlay.root.querySelector('[data-action="commit-insert"]')?.click();
      else if (state.mode?.startsWith('modify-')) overlay.root.querySelector('[data-action="commit-modify"]')?.click();
    },
    autoBend: () => overlay.root.querySelector('[data-action="auto-bend"]')?.click(),
    autoTee: () => overlay.root.querySelector('[data-action="auto-tee"]')?.click(),
    cancel: () => overlay.root.querySelector('[data-action="cancel"]')?.click(),
  });

  const onPointerMove = (ev) => {
    const state = store.getState();
    if (!state.visible || state.mode !== 'line-draw') return;
    const rect = container.getBoundingClientRect();
    const axis = String(state.draft?.axis || 'X').toUpperCase();
    let sign = state.draft?.sign < 0 ? -1 : 1;
    if (axis === 'X') sign = ev.clientX >= rect.left + rect.width / 2 ? 1 : -1;
    if (axis === 'Y' || axis === 'Z') sign = ev.clientY <= rect.top + rect.height / 2 ? 1 : -1;
    if (sign !== state.draft?.sign) {
      const draft = { ...(state.draft || {}), sign };
      draft.previewPoint = computePreviewPoint(draft.anchorPoint, draft.axis, draft.lengthMm, draft.sign);
      store.patch({ draft });
    }
  };
  container.addEventListener('mousemove', onPointerMove);

  const routeEngine = shellApi.getRouteEngine?.();
  const offRoute = routeEngine?.subscribe?.(() => {
    const state = store.getState();
    if (state.mode === 'line-draw' && state.draft) {
      const anchorPoint = getActiveRouteAnchor(shellApi);
      const draft = { ...(state.draft || {}), routeId: routeEngine.getActiveRoute?.()?.id || state.draft.routeId || null, anchorPoint };
      draft.previewPoint = computePreviewPoint(anchorPoint, draft.axis, draft.lengthMm, draft.sign);
      store.patch({ draft });
    }
    if (state.mode === 'insert-component' && state.insertContext) {
      store.patch({ insertContext: { ...(state.insertContext || {}), point: getActiveRouteAnchor(shellApi) } });
    }
  }) || (() => {});

  const api = {
    getState() {
      return store.getState();
    },
    showLineMode() {
      overlay.root.querySelector('[data-action="line"]')?.click();
    },
    showModifyMode(tool) {
      const btn = overlay.root.querySelector(`[data-action="modify-${tool}"]`);
      if (btn) btn.click();
      else overlay.activateModify?.(tool);
    },
    showInsertMode(component = 'VALVE') {
      const btn = overlay.root.querySelector(`[data-action="insert-${String(component).toLowerCase()}"]`);
      if (btn) btn.click();
      else store.patch({ visible: true, mode: 'insert-component', insertContext: resolveInsertDefaults(component, shellApi) });
    },
    destroy() {
      try { offKeyboard?.(); } catch (_) {}
      try { offRoute?.(); } catch (_) {}
      try { unsubscribeRender?.(); } catch (_) {}
      try { container.removeEventListener('mousemove', onPointerMove); } catch (_) {}
      overlay.destroy();
    },
  };

  if (typeof window !== 'undefined') {
    window.__hudApi = api;
  }

  return api;
}
