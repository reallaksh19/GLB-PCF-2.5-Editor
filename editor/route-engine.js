import { createInitialEditorState } from '../core/state.js';
import { emit } from '../core/event-bus.js';
import { createHistoryRecord, createInitialHistoryState } from './history.js';
import { createCommand, CommandTypes } from './command-types.js';
import { executeEditorCommand } from './command-executor.js';
import { aggregateRouteMetrics } from './route-metrics.js';
import { boundsFromPoints, normalizeAxisDelta, normalizePoint } from './coordinate-normalizer.js';
import { registerDefaultRouteHandlers } from './route-engine-handlers.js';
import { clone, routeBendCandidate, routeModelToComponents, routeTeeCandidate, uid } from './route-engine-utils.js';

export const ROUTE_ENGINE_VERSION = '1.0.0-ai2';
export { registerDefaultRouteHandlers, routeModelToComponents };

function createEditorStore(seedState) {
  let state = { ...clone(seedState || createInitialEditorState()), history: createInitialHistoryState() };
  const listeners = new Set();
  return {
    getState: () => state,
    setState(nextState) { state = nextState; listeners.forEach((fn) => fn(state)); },
    applyPatch(patch, command) {
      const history = state.history || createInitialHistoryState();
      const nextState = {
        ...state,
        ...patch,
        model: patch.model ? { ...(state.model || {}), ...patch.model } : (state.model || {}),
        selection: patch.selection ? { ...(state.selection || {}), ...patch.selection } : (state.selection || {}),
        diagnostics: patch.diagnostics ? { ...(state.diagnostics || {}), ...patch.diagnostics } : (state.diagnostics || {}),
      };
      if (!command?.meta?.skipHistory && !command?.meta?.transient) {
        const record = createHistoryRecord(command, patch, { routeEngineVersion: ROUTE_ENGINE_VERSION });
        nextState.history = { ...history, undoStack: [...(history.undoStack || []), record], redoStack: [] };
      } else nextState.history = history;
      state = nextState;
      listeners.forEach((fn) => fn(state, command, patch));
      return nextState;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export function createRouteEngine(options = {}) {
  registerDefaultRouteHandlers();
  const store = createEditorStore(options.initialState || createInitialEditorState());
  const listeners = new Set();
  const getState = () => store.getState();
  const getRoutes = () => getState().model?.routes || [];
  const getInlineComponents = () => getState().model?.components || [];
  const getActiveRoute = () => getRoutes().find((route) => route.id === getState().selection?.activeRouteId) || null;
  const notifyTrace = (event, details = {}, ok = true) => {
    const trace = { scope: 'route-engine', event, ok, details, timestamp: Date.now(), version: ROUTE_ENGINE_VERSION };
    emit('debug:trace', trace);
    options.onTrace?.(trace);
    return trace;
  };
  store.subscribe((nextState, command) => {
    nextState.diagnostics = nextState.diagnostics || { traces: [], metrics: {} };
    nextState.diagnostics.metrics = {
      ...(nextState.diagnostics.metrics || {}),
      routes: aggregateRouteMetrics(nextState.model?.routes || []),
      bounds: boundsFromPoints((nextState.model?.routes || []).flatMap((route) => route.nodes || [])),
    };
    listeners.forEach((fn) => fn(nextState, command));
  });
  function execute(command) {
    const applied = executeEditorCommand(store, command);
    notifyTrace('COMMAND_EXECUTED', { commandType: command.type, routeId: command.payload?.routeId || getState().selection?.activeRouteId || null }, true);
    return applied;
  }
  const run = (type, payload, meta = {}, ret = () => getActiveRoute()) => { execute(createCommand(type, payload, meta)); return ret(); };
  const startRoute = (point, spec = {}, meta = {}) => {
    const p = normalizePoint(point);
    run(CommandTypes.ROUTE_START, { ...p, spec, routeId: meta.routeId }, meta);
    return getState().selection?.activeRouteId;
  };
  const addSegment = (deltaOrPayload, meta = {}) => run(CommandTypes.ROUTE_SEGMENT_ADD,
    deltaOrPayload?.dx != null || deltaOrPayload?.dy != null || deltaOrPayload?.dz != null ? { ...normalizeAxisDelta(deltaOrPayload), routeId: deltaOrPayload.routeId } : { ...deltaOrPayload }, meta);
  const addToPoint = (routeId, point, meta = {}) => run(CommandTypes.ROUTE_SEGMENT_ADD, { routeId, to: normalizePoint(point) }, meta);
  const vertical = (lengthMm, routeId, sign, meta, source) => {
    const len = Number(lengthMm);
    if (!Number.isFinite(len) || len <= 0) throw new Error(`${source === 'route-engine-rise' ? 'rise' : 'drop'}(lengthMm) requires a positive number`);
    return addSegment({ routeId, dx: 0, dy: 0, dz: sign * len }, { ...meta, source: meta.source || source });
  };
  const moveNode = (routeId, nodeId, absoluteOrDelta, meta = {}) => run(CommandTypes.ROUTE_NODE_MOVE,
    absoluteOrDelta?.x != null || absoluteOrDelta?.y != null || absoluteOrDelta?.z != null ? { routeId, nodeId, absolute: normalizePoint(absoluteOrDelta) } : { routeId, nodeId, ...normalizeAxisDelta(absoluteOrDelta) }, meta);
  const commandWithPoint = (type, routeId, segmentId, point = null, meta = {}) => run(type, { routeId, segmentId, point: point ? normalizePoint(point) : null }, meta);
  const stretchNode = (routeId, nodeId, delta, meta = {}) => run(CommandTypes.ROUTE_STRETCH, { routeId, nodeId, ...normalizeAxisDelta(delta) }, meta);
  const rotateNodes = (routeId, pivot, angle, axis = 'Z', nodeIds = null, meta = {}) => run(CommandTypes.ROUTE_ROTATE, { routeId, pivot: normalizePoint(pivot), angle, axis, nodeIds }, meta);
  const insertComponent = (payload = {}, meta = {}) => run(CommandTypes.INSERT_COMPONENT, payload, meta, () => getState().model?.components || []);
  const autoBend = (payload = {}, meta = {}) => run(CommandTypes.AUTO_BEND, payload, meta, () => getState().model?.components || []);
  const autoTee = (payload = {}, meta = {}) => run(CommandTypes.AUTO_TEE, payload, meta, () => getState().model?.components || []);
  const createPolyline = (points, spec = {}, meta = {}) => {
    if (!points || points.length < 2) throw new Error('Polyline requires at least two points');
    const routeId = meta.routeId || uid('route');
    run(CommandTypes.ROUTE_POLYLINE_CREATE, { routeId, points: points.map((p) => normalizePoint(p)), spec }, meta);
    return routeId;
  };
  const createGuide = (points, guideType = 'LINE', meta = {}) => {
    const id = meta.id || uid('guide');
    run(CommandTypes.GUIDE_CREATE, { id, points: points.map((p) => normalizePoint(p)), guideType }, meta, () => id);
    return id;
  };
  const moveGuide = (id, delta, meta = {}) => run(CommandTypes.GUIDE_MOVE, { id, ...normalizeAxisDelta(delta) }, meta, () => id);
  const deleteGuide = (id, meta = {}) => run(CommandTypes.GUIDE_DELETE, { id }, meta, () => undefined);
  const getAutoBendCandidate = (routeId = null, nodeId = null) => {
    const routes = getRoutes();
    const route = routes.find((item) => item.id === (routeId || getState().selection?.activeRouteId)) || routes[0] || null;
    return route ? routeBendCandidate(route, nodeId) : null;
  };
  const getAutoTeeCandidate = (routeId = null, nodeId = null) => {
    const routes = getRoutes();
    const route = routes.find((item) => item.id === (routeId || getState().selection?.activeRouteId)) || routes[0] || null;
    return route ? routeTeeCandidate(routes, route, nodeId) : null;
  };
  return {
    version: ROUTE_ENGINE_VERSION,
    store,
    execute,
    createGuide,
    moveGuide,
    deleteGuide,
    createPolyline,
    startRoute,
    addSegment,
    addToPoint,
    rise: (lengthMm, routeId = null, meta = {}) => vertical(lengthMm, routeId, 1, meta, 'route-engine-rise'),
    drop: (lengthMm, routeId = null, meta = {}) => vertical(lengthMm, routeId, -1, meta, 'route-engine-drop'),
    moveNode,
    splitSegment: (routeId, segmentId, point = null, meta = {}) => commandWithPoint(CommandTypes.ROUTE_SPLIT_SEGMENT, routeId, segmentId, point, meta),
    stretchNode,
    rotateNodes,
    breakSegment: (routeId, segmentId, point = null, meta = {}) => commandWithPoint(CommandTypes.ROUTE_BREAK, routeId, segmentId, point, meta),
    insertComponent,
    getAutoBendCandidate,
    autoBend,
    getAutoTeeCandidate,
    autoTee,
    getState,
    getRoutes,
    getInlineComponents,
    getDerivedComponents: () => routeModelToComponents(getRoutes(), getInlineComponents(), getState().model?.guides || []),
    getMetrics: () => aggregateRouteMetrics(getRoutes()),
    getActiveRoute,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
