import { emit } from '../core/event-bus.js';
import { initialHudState, createHudTrace } from './hud-contract.js';
import { createHudStore } from './hud-state.js';
import { createHudOverlay } from './hud-overlay.js';
import { installHudKeyboard } from './hud-keyboard.js';
import { computePreviewPoint, getActiveRouteAnchor, commitLineDraft } from './hud-line-draw.js';
import { buildRepeatLineDraft, safeResolveLineDraftPreview, updateLineDraftField } from './hud-line-professional.js';
import { addPolylineAbsolutePoint, addPolylineSegment, closePolylineDraft, createPolylineDraft, finishPolylineDraftPayload, setPolylinePreviewPoint, undoPolylineSegment, updatePolylineDraftField } from './hud-polyline-professional.js';
import { addSplineAbsolutePoint, addSplinePoint, clearSplineDraft, createSplineDraft, finishSplineDraftPayload, setSplinePreviewPoint, undoSplinePoint, updateSplineDraftField } from './hud-spline-professional.js';
import { getInsertDefaults, resolveInsertContext, commitInsertDraft } from './hud-component-insert.js';

const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const emitHudTrace = (event, details = {}, ok = true) => emit('debug:trace', createHudTrace(event, details, ok));
const errMsg = (err) => String(err?.message || err);
function hasRealRouteAnchor(shellApi) {
  const route = shellApi?.getRouteEngine?.()?.getActiveRoute?.();
  const selected = shellApi?.getSelectedComponent?.();
  return route?.nodes?.length > 0 || Boolean(selected?.geometry?.origin || selected?.geometry?.ep2 || selected?.geometry?.ep1);
}
function buildInitialLineDraft(shellApi, prev = {}) {
  const axis = String(prev.axis || 'X').toUpperCase();
  const routeId = shellApi?.getRouteEngine?.()?.getActiveRoute?.()?.id || prev.routeId || null;
  const anchorPoint = prev.anchorPoint || (hasRealRouteAnchor(shellApi) ? getActiveRouteAnchor(shellApi) : null);
  return safeResolveLineDraftPreview({
    axis, sign: prev.sign < 0 ? -1 : 1, lengthMm: Number(prev.lengthMm) > 0 ? Number(prev.lengthMm) : 1000,
    routeId, inputMode: prev.inputMode || 'Length', angleDeg: Number(prev.angleDeg) || 0, dx: Number(prev.dx) || 0,
    dy: Number(prev.dy) || 0, dz: Number(prev.dz) || 0, commandText: String(prev.commandText || ''), anchorPoint,
    previewPoint: prev.previewPoint || null, size: prev.size || '', rating: prev.rating || '', pipelineRef: prev.pipelineRef || '',
  });
}
const resolveInsertDefaults = (component, shellApi) => {
  const base = getInsertDefaults(component, shellApi);
  return resolveInsertContext(base, shellApi)?.insertContext || base;
};
function updateInsertContextField(state, field, value, shellApi) {
  const insertContext = { ...(state.insertContext || {}), [field]: value };
  if (field === 'length' || field === 'weight') return { ...insertContext, provenance: 'manual', warnings: [] };
  return resolveInsertContext(insertContext, shellApi, { preserveManual: true })?.insertContext || insertContext;
}
const shapeComp = (kind, center, radius, extra = {}) => ({
  id: `${kind}-${Date.now()}`, type: `${kind}_SHAPE`, label: `${kind[0] + kind.slice(1).toLowerCase()} r=${Math.round(radius)}mm`,
  geometry: { origin: center, ep1: { x: center.x + radius, y: center.y, z: center.z }, ep2: { x: center.x - radius, y: center.y, z: center.z }, bore: radius * 2, radius, ...extra.geometry },
  attributes: { RADIUS: radius, TYPE: `${kind}_SHAPE` },
  metadata: { source: `hud-${kind.toLowerCase()}`, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] },
});
const radiusBetween = (a, b) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);

export function createHudOrchestrator({ container, shellApi }) {
  if (!container) throw new Error('HUD requires a container');
  if (!shellApi) throw new Error('HUD requires shellApi');
  const store = createHudStore({ ...clone(initialHudState), visible: false, mode: 'idle', errors: [], lastLengthMm: null });
  const patchDraft = (draft) => store.patch({ draft, draftPoints: draft.points || [], currentPreviewPoint: draft.previewPoint || null, errors: draft.errors || [] });
  const pickPlane = (ev, z = 0) => {
    const rect = container.getBoundingClientRect();
    return shellApi.renderer?.pickPlane?.(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1, z);
  };
  const pickHit = (ev) => {
    const rect = container.getBoundingClientRect();
    return shellApi.renderer?.pick?.(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  };
  const selectLater = (inserted, reason) => inserted && setTimeout(() => { try { shellApi.selectComponent?.(inserted, null, reason); } catch (_) {} }, 0);
  const addShape = (comp) => { shellApi.appendComponent(comp); shellApi.renderer?.addComponent?.(comp, shellApi.getDomain?.(), false); };
  const activateLine = () => {
    const nextDraft = buildInitialLineDraft(shellApi, store.getState().draft || {});
    const awaitingAnchorClick = !nextDraft.anchorPoint;
    store.patch({ visible: true, mode: 'line-draw', draft: nextDraft, awaitingAnchorClick, errors: [] });
    emitHudTrace('LINE_MODE_OPEN', { axis: nextDraft.axis, routeId: nextDraft.routeId || null, awaitingAnchorClick });
  };
  const activatePolyline = () => {
    const routeId = shellApi?.getRouteEngine?.()?.getActiveRoute?.()?.id || null;
    const startPoint = hasRealRouteAnchor(shellApi) ? getActiveRouteAnchor(shellApi) : null;
    const draft = createPolylineDraft(startPoint, { routeId });
    store.patch({ visible: true, mode: 'polyline-draw', draft, draftPoints: draft.points, errors: [] });
    emitHudTrace('POLYLINE_MODE_OPEN', { routeId, hasStartPoint: Boolean(startPoint) });
  };
  const activateSpline = () => {
    const startPoint = hasRealRouteAnchor(shellApi) ? getActiveRouteAnchor(shellApi) : null;
    const draft = createSplineDraft(startPoint);
    store.patch({ visible: true, mode: 'spline-draw', draft, draftPoints: draft.points, errors: [] });
    emitHudTrace('SPLINE_MODE_OPEN', { hasStartPoint: Boolean(startPoint) });
  };
  const activateCircle = () => { store.patch({ visible: true, mode: 'circle-draw', draftPoints: [], errors: [] }); emitHudTrace('CIRCLE_MODE_OPEN'); };
  const activateArc = () => { store.patch({ visible: true, mode: 'arc-draw', draftPoints: [], errors: [] }); emitHudTrace('ARC_MODE_OPEN'); };
  const activateInsert = (component) => {
    const ctx = resolveInsertDefaults(component, shellApi);
    store.patch({ visible: true, mode: 'insert-component', insertContext: ctx, provenance: ctx.provenance || 'default', errors: [] });
    emitHudTrace('INSERT_MODE_OPEN', { component: ctx.component, point: ctx.point, provenance: ctx.provenance || 'default', matchKey: ctx.resolvedMatchKey || null }, true);
  };
  const activateModifyTool = (tool) => { store.patch({ visible: true, mode: 'modify-tool', activeTool: tool, modifyDraft: null, errors: [] }); emitHudTrace('MODIFY_TOOL_OPEN', { tool }); };
  const cancelHud = () => {
    const state = store.getState();
    if (['polyline-draw', 'spline-draw', 'circle-draw', 'arc-draw'].includes(state.mode)) { store.patch({ draftPoints: [], errors: [], mode: 'idle' }); emitHudTrace('DRAFT_CANCELLED'); }
    else if (state.mode === 'modify-tool') { store.patch({ modifyDraft: null, activeTool: null, mode: 'idle', errors: [] }); emitHudTrace('MODIFY_CANCELLED'); }
    store.patch({ mode: 'idle', draft: null, insertContext: null, errors: [], visible: state.visible });
    emitHudTrace('HUD_CANCEL', {}, true);
  };
  const setAxisFn = (axis) => {
    const state = store.getState();
    if (state.mode !== 'line-draw') return;
    const draft = updateLineDraftField(state.draft || {}, 'axis', axis);
    store.patch({ draft, axisLock: draft.axis, errors: draft.errors || [] });
  };
  const setSignFn = (sign) => {
    const state = store.getState();
    if (state.mode !== 'line-draw') return;
    const draft = updateLineDraftField(state.draft || {}, 'sign', sign < 0 ? -1 : 1);
    store.patch({ draft, errors: draft.errors || [] });
  };
  const commitCurrentLine = (traceName = 'LINE_COMMIT') => {
    try {
      const state = store.getState();
      const result = commitLineDraft(state, shellApi);
      const nextDraft = buildInitialLineDraft(shellApi, { ...(state.draft || {}), routeId: result.routeId, anchorPoint: result.anchorPoint, lengthMm: state.draft?.lengthMm });
      nextDraft.previewPoint = result.previewPoint;
      store.patch({ visible: true, mode: 'line-draw', draft: nextDraft, lastLengthMm: result.lastLengthMm, errors: [] });
      emitHudTrace(traceName, { routeId: result.routeId, axis: nextDraft.axis, lengthMm: result.lastLengthMm }, true);
    } catch (err) { store.patch({ errors: [errMsg(err)] }); emitHudTrace(`${traceName}_FAIL`, { message: errMsg(err) }, false); }
  };
  const commitVertical = (sign, traceName) => {
    const state = store.getState();
    const draft = { ...(state.draft || {}), axis: 'Z', sign };
    draft.previewPoint = computePreviewPoint(draft.anchorPoint, 'Z', draft.lengthMm, sign);
    store.patch({ mode: 'line-draw', visible: true, draft, errors: [] });
    commitCurrentLine(traceName);
  };
  const commitAuto = (method, source, traceName, reason) => {
    try { const inserted = shellApi[method]?.({ source }); selectLater(inserted, reason); store.patch({ errors: [] }); emitHudTrace(traceName, { insertedId: inserted?.id || null }, true); }
    catch (err) { store.patch({ visible: true, errors: [errMsg(err)] }); emitHudTrace(`${traceName}_FAIL`, { message: errMsg(err) }, false); }
  };

  const overlay = createHudOverlay(container, {
    open: () => store.patch({ visible: true, errors: [] }), hide: () => store.patch({ visible: false, errors: [], mode: 'idle' }),
    activateLine, activatePolyline, activateSpline, activateCircle, activateArc, activateInsert, activateModifyTool, cancel: cancelHud,
    setAxis: setAxisFn, setSign: setSignFn,
    updateField: (field, value) => {
      const state = store.getState();
      if (state.mode === 'line-draw') {
        const draft = updateLineDraftField(state.draft || {}, field, value);
        store.patch({ draft, axisLock: draft.axis, errors: draft.errors || [] });
      } else if (state.mode === 'polyline-draw') patchDraft(updatePolylineDraftField(state.draft || {}, field, value));
      else if (state.mode === 'spline-draw') patchDraft(updateSplineDraftField(state.draft || {}, field, value));
      else if (state.mode === 'insert-component') {
        const insertContext = updateInsertContextField(state, field, value, shellApi);
        store.patch({ insertContext, provenance: insertContext.provenance || 'manual', errors: [] });
      }
    },
    commitLine: () => { if (store.getState().mode === 'line-draw') commitCurrentLine(); },
    repeatLine: () => {
      const state = store.getState();
      if (state.mode !== 'line-draw') return;
      try { const draft = buildRepeatLineDraft(state.draft || {}, state.lastLengthMm || state.draft?.lengthMm || 1000); store.patch({ draft, axisLock: draft.axis, errors: draft.errors || [] }); overlay.root.querySelector('[data-action="commit-line"]')?.click(); }
      catch (err) { store.patch({ errors: [errMsg(err)] }); emitHudTrace('LINE_REPEAT_FAIL', { message: errMsg(err) }, false); }
    },
    addPolylineSegment: () => {
      const state = store.getState(); if (state.mode !== 'polyline-draw') return;
      const draft = addPolylineSegment(state.draft || {}); patchDraft(draft);
      if (!(draft.errors || []).length) emitHudTrace('POLYLINE_SEGMENT_ADDED', { points: draft.points?.length || 0, segments: draft.segments?.length || 0 }, true);
    },
    undoPolylineSegment: () => { const state = store.getState(); if (state.mode !== 'polyline-draw') return; const draft = undoPolylineSegment(state.draft || {}); patchDraft(draft); emitHudTrace('POLYLINE_UNDO', { points: draft.points?.length || 0, segments: draft.segments?.length || 0 }, true); },
    closePolyline: () => { const state = store.getState(); if (state.mode !== 'polyline-draw') return; const draft = closePolylineDraft(state.draft || {}); patchDraft(draft); if (!(draft.errors || []).length) emitHudTrace('POLYLINE_CLOSE', { points: draft.points?.length || 0, segments: draft.segments?.length || 0 }, true); },
    finishPolyline: () => {
      const state = store.getState(); if (state.mode !== 'polyline-draw') return;
      const payload = finishPolylineDraftPayload(state.draft || {});
      if (!payload.ok) { store.patch({ errors: payload.errors || [] }); emitHudTrace('POLYLINE_COMMIT_FAIL', { errors: payload.errors || [] }, false); return; }
      try {
        shellApi.getRouteEngine?.().createPolyline(payload.points, { routeId: payload.routeId || undefined, pipelineRef: payload.pipelineRef || undefined }, { source: 'hud-polyline' });
        store.patch({ mode: 'idle', draft: null, draftPoints: [], currentPreviewPoint: null, errors: [] });
        emitHudTrace('POLYLINE_COMMIT', { points: payload.points.length, segments: payload.segments.length }, true);
      } catch (err) { store.patch({ errors: [errMsg(err)] }); emitHudTrace('POLYLINE_COMMIT_FAIL', { message: errMsg(err) }, false); }
    },
    addSplinePoint: () => { const state = store.getState(); if (state.mode !== 'spline-draw') return; const draft = addSplinePoint(state.draft || {}); patchDraft(draft); if (!(draft.errors || []).length) emitHudTrace('SPLINE_POINT_ADDED', { points: draft.points?.length || 0 }, true); },
    undoSplinePoint: () => { const state = store.getState(); if (state.mode !== 'spline-draw') return; const draft = undoSplinePoint(state.draft || {}); patchDraft(draft); emitHudTrace('SPLINE_UNDO', { points: draft.points?.length || 0 }, true); },
    clearSpline: () => { const state = store.getState(); if (state.mode !== 'spline-draw') return; const draft = clearSplineDraft(state.draft || {}); store.patch({ draft, draftPoints: [], currentPreviewPoint: null, errors: [] }); emitHudTrace('SPLINE_CLEAR', {}, true); },
    finishSpline: () => {
      const state = store.getState(); if (state.mode !== 'spline-draw') return;
      const payload = finishSplineDraftPayload(state.draft || {});
      if (!payload.ok) { store.patch({ errors: payload.errors || [] }); emitHudTrace('SPLINE_COMMIT_FAIL', { errors: payload.errors || [] }, false); return; }
      try {
        shellApi.getRouteEngine?.().createGuide(payload.points, payload.guideType, { source: 'hud-spline', pipelineRef: payload.pipelineRef || undefined });
        store.patch({ mode: 'idle', draft: null, draftPoints: [], currentPreviewPoint: null, errors: [] });
        emitHudTrace('SPLINE_COMMIT', { points: payload.points.length, guideType: payload.guideType }, true);
      } catch (err) { store.patch({ errors: [errMsg(err)] }); emitHudTrace('SPLINE_COMMIT_FAIL', { message: errMsg(err) }, false); }
    },
    commitRise: () => commitVertical(1, 'LINE_RISE_COMMIT'), commitDrop: () => commitVertical(-1, 'LINE_DROP_COMMIT'),
    commitInsert: () => {
      const state = store.getState(); if (state.mode !== 'insert-component') return;
      try {
        const { payload, inserted } = commitInsertDraft(state.insertContext, shellApi);
        selectLater(inserted, 'hud-insert');
        const nextCtx = resolveInsertDefaults(payload.component, shellApi);
        store.patch({ visible: true, mode: 'insert-component', insertContext: nextCtx, provenance: payload.provenance || 'manual', errors: [] });
        emitHudTrace('INSERT_COMMIT', { component: payload.component, subtype: payload.subtype, size: payload.size, rating: payload.rating, provenance: payload.provenance || 'manual', length: payload.length || '', weight: payload.weight || '' }, true);
      } catch (err) { store.patch({ errors: [errMsg(err)] }); emitHudTrace('INSERT_COMMIT_FAIL', { message: errMsg(err) }, false); }
    },
    commitAutoBend: () => commitAuto('autoBendRoute', 'hud-auto-bend', 'AUTO_BEND_COMMIT', 'hud-auto-bend'),
    commitAutoTee: () => commitAuto('autoTeeRoute', 'hud-auto-tee', 'AUTO_TEE_COMMIT', 'hud-auto-tee'),
  });

  const unsubscribeRender = store.subscribe((state) => overlay.render(state));
  overlay.render(store.getState());
  const offKeyboard = installHudKeyboard(overlay.root, {
    line: activateLine, insert: activateInsert, axis: setAxisFn, sign: setSignFn, cancel: cancelHud,
    commit: () => {
      const state = store.getState();
      if (state.mode === 'line-draw') overlay.root.querySelector('[data-action="commit-line"]')?.click();
      else if (state.mode === 'insert-component') overlay.root.querySelector('[data-action="commit-insert"]')?.click();
    },
    autoBend: () => commitAuto('autoBendRoute', 'hud-kb-auto-bend', 'AUTO_BEND_COMMIT', 'hud-kb-auto-bend'),
    autoTee: () => commitAuto('autoTeeRoute', 'hud-kb-auto-tee', 'AUTO_TEE_COMMIT', 'hud-kb-auto-tee'),
  });

  const onPointerClick = (ev) => {
    if (ev.target?.closest?.('.hud-overlay')) return;
    const state = store.getState();
    if (!state.visible) return;
    if (state.mode === 'line-draw') {
      if (state.awaitingAnchorClick || !state.draft?.anchorPoint) {
        const worldPt = pickPlane(ev, 0);
        if (worldPt) { const draft = safeResolveLineDraftPreview({ ...(state.draft || {}), anchorPoint: worldPt }); store.patch({ draft, awaitingAnchorClick: false, errors: draft.errors || [] }); emitHudTrace('LINE_ANCHOR_SET', { point: worldPt }); }
      }
      return;
    }
    if (state.mode === 'insert-component') { const worldPt = pickPlane(ev, 0); if (worldPt) { store.patch({ insertContext: { ...(state.insertContext || {}), point: worldPt } }); emitHudTrace('INSERT_POINT_SET', { point: worldPt }); } return; }
    if (state.mode === 'polyline-draw') { const worldPt = pickPlane(ev, 0); if (worldPt) { const draft = addPolylineAbsolutePoint(state.draft || {}, worldPt); patchDraft(draft); emitHudTrace('POLYLINE_POINT_ADDED', { points: draft.points?.length || 0, segments: draft.segments?.length || 0 }, !(draft.errors || []).length); } return; }
    if (state.mode === 'spline-draw') { const worldPt = pickPlane(ev, 0); if (worldPt) { const draft = addSplineAbsolutePoint(state.draft || {}, worldPt); patchDraft(draft); emitHudTrace('SPLINE_POINT_ADDED', { points: draft.points?.length || 0 }, !(draft.errors || []).length); } return; }
    if (state.mode === 'circle-draw') {
      const worldPt = pickPlane(ev, 0); if (!worldPt) return;
      const pts = [...(state.draftPoints || []), worldPt];
      if (pts.length === 1) { store.patch({ draftPoints: pts, currentPreviewPoint: worldPt }); emitHudTrace('CIRCLE_CENTER_SET', { center: worldPt }); return; }
      const radius = radiusBetween(pts[0], worldPt);
      if (radius > 1) { try { addShape(shapeComp('CIRCLE', pts[0], radius)); emitHudTrace('CIRCLE_COMMIT', { center: pts[0], radius }, true); } catch (err) { store.patch({ errors: [errMsg(err)] }); } }
      store.patch({ draftPoints: [], currentPreviewPoint: null });
      return;
    }
    if (state.mode === 'arc-draw') {
      const worldPt = pickPlane(ev, 0); if (!worldPt) return;
      const pts = [...(state.draftPoints || []), worldPt];
      if (pts.length === 1) { store.patch({ draftPoints: pts, currentPreviewPoint: worldPt }); emitHudTrace('ARC_CENTER_SET', { center: worldPt }); return; }
      if (pts.length === 2) { store.patch({ draftPoints: pts, currentPreviewPoint: worldPt }); emitHudTrace('ARC_EP1_SET', { ep1: worldPt }); return; }
      const [center, ep1] = pts, ep2 = worldPt, radius = radiusBetween(center, ep1);
      if (radius > 1) { try { addShape(shapeComp('ARC', center, radius, { geometry: { cp: center, ep1, ep2 } })); emitHudTrace('ARC_COMMIT', { center, ep1, ep2, radius }, true); } catch (err) { store.patch({ errors: [errMsg(err)] }); } }
      store.patch({ draftPoints: [], currentPreviewPoint: null });
      return;
    }
    if (state.mode !== 'modify-tool' || !state.activeTool) return;
    const hit = pickHit(ev); if (!hit?.comp) return;
    const engine = shellApi.getRouteEngine?.(); if (!engine) return;
    const routeAttrs = hit.comp.attributes || {}, routeId = routeAttrs.ROUTE_ID, segmentId = routeAttrs.SEGMENT_ID, nodeId = hit.comp.metadata?.source?.nodeId;
    if (!routeId) return;
    try {
      if ((state.activeTool === 'MOVE' || state.activeTool === 'STRETCH') && nodeId) {
        if (!state.modifyDraft) { store.patch({ modifyDraft: { baseNodeId: nodeId, baseRouteId: routeId, baseHit: hit.comp.geometry.origin } }); emitHudTrace(state.activeTool === 'MOVE' ? 'MODIFY_BASE_PICKED' : 'STRETCH_BASE_PICKED', { nodeId }); return; }
        const p = state.currentPreviewPoint || state.modifyDraft.baseHit;
        const delta = { dx: p.x - state.modifyDraft.baseHit.x, dy: p.y - state.modifyDraft.baseHit.y, dz: p.z - state.modifyDraft.baseHit.z };
        if (state.activeTool === 'MOVE') engine.moveNode(routeId, state.modifyDraft.baseNodeId, delta, { source: 'hud-move' });
        else engine.stretchNode(routeId, state.modifyDraft.baseNodeId, delta, { source: 'hud-stretch' });
        store.patch({ modifyDraft: null, activeTool: null, mode: 'idle' });
      } else if (state.activeTool === 'ROTATE') {
        if (!state.modifyDraft) { store.patch({ modifyDraft: { baseRouteId: routeId, pivot: hit.comp.geometry.origin } }); emitHudTrace('ROTATE_PIVOT_PICKED', { pivot: hit.comp.geometry.origin }); return; }
        const p = state.currentPreviewPoint || state.modifyDraft.pivot;
        engine.rotateNodes(routeId, state.modifyDraft.pivot, Math.atan2(p.y - state.modifyDraft.pivot.y, p.x - state.modifyDraft.pivot.x) * 180 / Math.PI, 'Z', null, { source: 'hud-rotate' });
        store.patch({ modifyDraft: null, activeTool: null, mode: 'idle' });
      } else if (state.activeTool === 'BREAK' && segmentId) {
        engine.breakSegment(routeId, segmentId, pickPlane(ev, hit.comp.geometry.origin.z) || hit.comp.geometry.origin, { source: 'hud-break' });
        store.patch({ activeTool: null, mode: 'idle' });
      } else if (state.activeTool === 'DELETE') {
        engine.execute({ type: 'ROUTE_DELETE', payload: segmentId ? { routeId, segmentId } : (nodeId ? { routeId, nodeId } : { routeId }), meta: { source: 'hud-delete' } });
        store.patch({ activeTool: null, mode: 'idle' });
      }
      emitHudTrace('MODIFY_TOOL_APPLIED', { tool: state.activeTool, compId: hit.comp.id });
    } catch (err) { store.patch({ errors: [errMsg(err)] }); }
  };
  const onDoubleClick = () => {
    const state = store.getState(); if (!state.visible) return;
    if (state.mode === 'polyline-draw') overlay.root.querySelector('[data-action="poly-finish"]')?.click();
    else if (state.mode === 'spline-draw') overlay.root.querySelector('[data-action="spline-finish"]')?.click();
  };
  const onPointerMove = (ev) => {
    const state = store.getState(); if (!state.visible) return;
    if (state.mode === 'polyline-draw') { const hit = pickPlane(ev, 0); if (hit) patchDraft(setPolylinePreviewPoint(state.draft || {}, hit)); return; }
    if (state.mode === 'spline-draw') { const hit = pickPlane(ev, 0); if (hit) patchDraft(setSplinePreviewPoint(state.draft || {}, hit)); return; }
    if (state.mode === 'circle-draw' || state.mode === 'arc-draw' || (state.mode === 'modify-tool' && state.modifyDraft)) { const hit = pickPlane(ev, 0); if (hit) store.patch({ currentPreviewPoint: hit }); return; }
    if (state.mode !== 'line-draw') return;
    const rect = container.getBoundingClientRect(), axis = String(state.draft?.axis || 'X').toUpperCase();
    let sign = state.draft?.sign < 0 ? -1 : 1;
    if (axis === 'X') sign = ev.clientX >= rect.left + rect.width / 2 ? 1 : -1;
    if (axis === 'Y' || axis === 'Z') sign = ev.clientY <= rect.top + rect.height / 2 ? 1 : -1;
    if (sign !== state.draft?.sign) { const draft = updateLineDraftField(state.draft || {}, 'sign', sign); store.patch({ draft, errors: draft.errors || [] }); }
  };
  container.addEventListener('click', onPointerClick);
  container.addEventListener('dblclick', onDoubleClick);
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
    if (state.mode === 'insert-component' && state.insertContext) store.patch({ insertContext: { ...(state.insertContext || {}), point: getActiveRouteAnchor(shellApi) } });
  }) || (() => {});

  const api = {
    getState: () => store.getState(), showLineMode: activateLine, showPolylineMode: activatePolyline, showSplineMode: activateSpline,
    showCircleMode: activateCircle, showArcMode: activateArc, activateModifyTool, showInsertMode: (component = 'VALVE') => activateInsert(component),
    destroy() {
      for (const fn of [offKeyboard, offRoute, unsubscribeRender]) { try { fn?.(); } catch (_) {} }
      try { container.removeEventListener('mousemove', onPointerMove); } catch (_) {}
      try { container.removeEventListener('click', onPointerClick); } catch (_) {}
      try { container.removeEventListener('dblclick', onDoubleClick); } catch (_) {}
      overlay.destroy();
    },
  };
  if (typeof window !== 'undefined') window.__hudApi = api;
  return api;
}
