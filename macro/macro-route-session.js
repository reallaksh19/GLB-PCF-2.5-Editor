export const MACRO_ACTIVE_ROUTE_KEY = 'activeRouteId';

export function parseRouteSessionArgs(tokens = []) {
  const opts = {};
  const values = [];

  for (const token of tokens || []) {
    const text = String(token || '');
    const idx = text.indexOf('=');

    if (idx > 0) {
      opts[text.slice(0, idx).trim().toUpperCase()] = text.slice(idx + 1).trim();
    } else {
      values.push(text);
    }
  }

  return { opts, values };
}

export function sessionRouteEngineOrThrow(ctx = {}) {
  const routeEngine = ctx.getRouteEngine?.();

  if (!routeEngine) {
    throw new Error('ROUTE engine not initialized');
  }

  return routeEngine;
}

export function getMacroActiveRouteId(ctx = {}) {
  return ctx[MACRO_ACTIVE_ROUTE_KEY] || ctx.macroActiveRouteId || null;
}

export function setMacroActiveRouteId(ctx = {}, routeId = null) {
  const id = routeId ? String(routeId) : null;

  ctx[MACRO_ACTIVE_ROUTE_KEY] = id;
  ctx.macroActiveRouteId = id;

  return id;
}

export function clearMacroActiveRouteId(ctx = {}) {
  ctx[MACRO_ACTIVE_ROUTE_KEY] = null;
  ctx.macroActiveRouteId = null;

  return null;
}

export function resolveRouteSessionId(tokens = [], ctx = {}, routeEngine = null) {
  const parsed = parseRouteSessionArgs(tokens);
  const routeId =
    parsed.opts.ROUTE ||
    parsed.opts.ROUTE_ID ||
    parsed.opts.ROUTEID ||
    parsed.values[0] ||
    getMacroActiveRouteId(ctx) ||
    routeEngine?.getState?.()?.selection?.activeRouteId ||
    null;

  return routeId ? String(routeId) : null;
}

export function findRouteById(routeEngine, routeId) {
  return (routeEngine?.getRoutes?.() || []).find((route) => route.id === routeId) || null;
}

export function assertRouteExists(routeEngine, routeId) {
  if (!routeId) {
    throw new Error('Route id is required');
  }

  const route = findRouteById(routeEngine, routeId);

  if (!route) {
    throw new Error(`Route not found: ${routeId}`);
  }

  return route;
}

export function useMacroRoute(tokens = [], ctx = {}) {
  const routeEngine = sessionRouteEngineOrThrow(ctx);
  const routeId = resolveRouteSessionId(tokens, ctx, routeEngine);
  const route = assertRouteExists(routeEngine, routeId);
  const activeRouteId = setMacroActiveRouteId(ctx, route.id);

  return {
    message: `USE_ROUTE active route set to ${activeRouteId}`,
    activeRouteId,
    routeId: activeRouteId,
    route: {
      id: route.id,
      nodeCount: route.nodes?.length || 0,
      segmentCount: route.segments?.length || 0,
    },
  };
}

export function currentMacroRoute(ctx = {}) {
  const routeEngine = sessionRouteEngineOrThrow(ctx);
  const activeRouteId = getMacroActiveRouteId(ctx) || routeEngine.getState?.()?.selection?.activeRouteId || null;

  if (!activeRouteId) {
    return {
      message: 'CURRENT_ROUTE: none',
      activeRouteId: null,
      routeId: null,
      route: null,
    };
  }

  const route = findRouteById(routeEngine, activeRouteId);

  return {
    message: route
      ? `CURRENT_ROUTE ${activeRouteId}: ${route.nodes?.length || 0} node(s), ${route.segments?.length || 0} segment(s)`
      : `CURRENT_ROUTE ${activeRouteId}: not found`,
    activeRouteId,
    routeId: activeRouteId,
    route: route
      ? {
          id: route.id,
          nodeCount: route.nodes?.length || 0,
          segmentCount: route.segments?.length || 0,
        }
      : null,
  };
}

export function clearMacroRoute(ctx = {}) {
  clearMacroActiveRouteId(ctx);

  return {
    message: 'CLEAR_ROUTE active route cleared',
    activeRouteId: null,
    routeId: null,
  };
}
