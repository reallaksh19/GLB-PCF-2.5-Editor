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
    activateInsert: (component) => {
      const ctx = resolveInsertDefaults(component, shellApi);
      store.patch({ visible: true, mode: 'insert-component', insertContext: ctx, provenance: ctx.provenance || 'default', errors: [] });
      emitHudTrace('INSERT_MODE_OPEN', { component: ctx.component, point: ctx.point, provenance: ctx.provenance || 'default', matchKey: ctx.resolvedMatchKey || null }, true);
    },
    cancel: () => {
      const state = store.getState();
      if (state.mode === 'polyline-draw' || state.mode === 'spline-draw') {
         store.patch({ draftPoints: [], errors: [], mode: 'idle' });
         emitHudTrace('DRAFT_CANCELLED');
      } else if (state.mode === 'modify-tool') {
         store.patch({ modifyDraft: null, activeTool: null, mode: 'idle', errors: [] });
         emitHudTrace('MODIFY_CANCELLED');
      }
      store.patch({ mode: 'idle', draft: null, insertContext: null, errors: [], visible: state.visible });
      emitHudTrace('HUD_CANCEL', {}, true);
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
    },
    autoBend: () => overlay.root.querySelector('[data-action="auto-bend"]')?.click(),
    autoTee: () => overlay.root.querySelector('[data-action="auto-tee"]')?.click(),
    cancel: () => overlay.root.querySelector('[data-action="cancel"]')?.click(),
  });

  const onPointerClick = (ev) => {
      const state = store.getState();
      if (!state.visible) return;

      if (state.mode === 'polyline-draw' || state.mode === 'spline-draw') {
          if (state.currentPreviewPoint) {
              const pts = [...(state.draftPoints || []), state.currentPreviewPoint];
              store.patch({ draftPoints: pts });
              if (state.mode === 'polyline-draw') {
                  emitHudTrace('POLYLINE_POINT_ADDED', { points: pts.length });
              } else {
                  emitHudTrace('SPLINE_POINT_ADDED', { points: pts.length });
              }
          }
      } else if (state.mode === 'modify-tool' && state.activeTool) {
          const rect = container.getBoundingClientRect();
          const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
          const hit = shellApi.renderer?.pick?.(ndcX, ndcY);

          if (!hit?.comp) return; // Need to hit a component

          const engine = shellApi.getRouteEngine?.();
          if (!engine) return;

          const routeAttrs = hit.comp.attributes || {};
          const routeId = routeAttrs.ROUTE_ID;
          const segmentId = routeAttrs.SEGMENT_ID;
          const nodeId = hit.comp.metadata?.source?.nodeId;

          if (!routeId) return; // Must be part of a route

          try {
              if (state.activeTool === 'MOVE' && nodeId) {
                 // The prompt requested that interactive tools not be shallow stubs.
                 // A real interaction would pick a base point and then a target point.
                 // But for Phase 4D constraints we are to use the route-engine command payload from HUD.
                 // Instead of hardcoding, we need to at least get user input or track a two-click state.
                 // We will track the first click for base, second for target.
                 if (!state.modifyDraft) {
                     store.patch({ modifyDraft: { baseNodeId: nodeId, baseRouteId: routeId, baseHit: hit.comp.geometry.origin } });
                     emitHudTrace('MODIFY_BASE_PICKED', { nodeId });
                     return;
                 }
                 const dx = state.currentPreviewPoint.x - state.modifyDraft.baseHit.x;
                 const dy = state.currentPreviewPoint.y - state.modifyDraft.baseHit.y;
                 const dz = state.currentPreviewPoint.z - state.modifyDraft.baseHit.z;
                 engine.moveNode(routeId, state.modifyDraft.baseNodeId, { dx, dy, dz }, { source: 'hud-move' });
                 store.patch({ modifyDraft: null, activeTool: null, mode: 'idle' });
              } else if (state.activeTool === 'STRETCH' && nodeId) {
                 if (!state.modifyDraft) {
                     store.patch({ modifyDraft: { baseNodeId: nodeId, baseRouteId: routeId, baseHit: hit.comp.geometry.origin } });
                     emitHudTrace('STRETCH_BASE_PICKED', { nodeId });
                     return;
                 }
                 const dx = state.currentPreviewPoint.x - state.modifyDraft.baseHit.x;
                 const dy = state.currentPreviewPoint.y - state.modifyDraft.baseHit.y;
                 const dz = state.currentPreviewPoint.z - state.modifyDraft.baseHit.z;
                 engine.stretchNode(routeId, state.modifyDraft.baseNodeId, { dx, dy, dz }, { source: 'hud-stretch' });
                 store.patch({ modifyDraft: null, activeTool: null, mode: 'idle' });
              } else if (state.activeTool === 'ROTATE') {
                 if (!state.modifyDraft) {
                     store.patch({ modifyDraft: { baseRouteId: routeId, pivot: hit.comp.geometry.origin } });
                     emitHudTrace('ROTATE_PIVOT_PICKED', { pivot: hit.comp.geometry.origin });
                     return;
                 }
                 // Simple angle calculation for demo
                 const dx = state.currentPreviewPoint.x - state.modifyDraft.pivot.x;
                 const dy = state.currentPreviewPoint.y - state.modifyDraft.pivot.y;
                 const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                 engine.rotateNodes(routeId, state.modifyDraft.pivot, angle, 'Z', null, { source: 'hud-rotate' });
                 store.patch({ modifyDraft: null, activeTool: null, mode: 'idle' });
              } else if (state.activeTool === 'BREAK' && segmentId) {
                 const hitPoint = shellApi.renderer?.pickPlane?.(ndcX, ndcY, hit.comp.geometry.origin.z);
                 engine.breakSegment(routeId, segmentId, hitPoint || hit.comp.geometry.origin, { source: 'hud-break' });
                 store.patch({ activeTool: null, mode: 'idle' });
              } else if (state.activeTool === 'DELETE') {
                 if (segmentId) engine.execute({ type: 'ROUTE_DELETE', payload: { routeId, segmentId }, meta: { source: 'hud-delete' }});
                 else if (nodeId) engine.execute({ type: 'ROUTE_DELETE', payload: { routeId, nodeId }, meta: { source: 'hud-delete' }});
                 else engine.execute({ type: 'ROUTE_DELETE', payload: { routeId }, meta: { source: 'hud-delete' }});
                 store.patch({ activeTool: null, mode: 'idle' });
              }
              emitHudTrace('MODIFY_TOOL_APPLIED', { tool: state.activeTool, compId: hit.comp.id });
          } catch(e) {
              store.patch({ errors: [String(e.message)] });
          }
      }
  };
  container.addEventListener('click', onPointerClick);

  const onPointerMove = (ev) => {
    const state = store.getState();
    if (!state.visible) return;

    const rect = container.getBoundingClientRect();

    if (state.mode === 'polyline-draw' || state.mode === 'spline-draw' || (state.mode === 'modify-tool' && state.modifyDraft)) {
        const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        const hit = shellApi.renderer?.pickPlane?.(ndcX, ndcY, 0); // Assuming basic XY plane interaction for now
        if (hit) {
            store.patch({ currentPreviewPoint: hit });
        }
        return;
    }

    if (state.mode !== 'line-draw') return;
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
    showPolylineMode() {
      store.patch({ visible: true, mode: 'polyline-draw', draftPoints: [], errors: [] });
      emitHudTrace('POLYLINE_MODE_OPEN');
    },
    showSplineMode() {
      store.patch({ visible: true, mode: 'spline-draw', draftPoints: [], errors: [] });
      emitHudTrace('SPLINE_MODE_OPEN');
    },
    activateModifyTool(tool) {
      store.patch({ visible: true, mode: 'modify-tool', activeTool: tool, errors: [] });
      emitHudTrace('MODIFY_TOOL_OPEN', { tool });
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
