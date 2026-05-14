import { getMacroActiveRouteId } from './macro-route-session.js';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function cloneRoutePoint(point) {
  return {
    x: finiteNumber(point?.x, 0),
    y: finiteNumber(point?.y, 0),
    z: finiteNumber(point?.z, 0),
  };
}

export function parseMacroRouteKv(tokens = []) {
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

export function parseRouteDeltaToken(token) {
  if (!token) throw new Error('Missing route delta token');

  const raw = String(token).startsWith('@') ? String(token).slice(1) : String(token);
  const parts = raw.split(',').map((value) => Number(value.trim()));

  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid route delta: ${token}`);
  }

  return {
    x: parts[0],
    y: parts[1],
    z: parts[2],
    dx: parts[0],
    dy: parts[1],
    dz: parts[2],
  };
}

export function routeEngineOrThrow(ctx = {}) {
  const routeEngine = ctx.getRouteEngine?.();

  if (!routeEngine) {
    throw new Error('ROUTE engine not initialized');
  }

  return routeEngine;
}

export function routeIdFromOptsOrActive(routeEngine, opts = {}, usage = 'route edit', ctx = {}) {
  const requested = opts.ROUTE || opts.ROUTE_ID || opts.ROUTEID;
  if (requested) return requested;

  const macroActive = getMacroActiveRouteId(ctx);
  if (macroActive) return macroActive;

  const active = routeEngine.getState?.()?.selection?.activeRouteId;
  if (active) return active;

  throw new Error(`${usage} requires ROUTE=..., USE_ROUTE, or an active route selection`);
}

export function routeById(routeEngine, routeId) {
  return (routeEngine.getRoutes?.() || []).find((route) => route.id === routeId) || null;
}

export function routeEditResult(kind, details = {}) {
  return {
    message: details.message || `${kind} applied`,
    kind,
    routeId: details.routeId || null,
    nodeId: details.nodeId || null,
    nodeIds: details.nodeIds || null,
    segmentId: details.segmentId || null,
    targetId: details.targetId || null,
    delta: details.delta || null,
    pivot: details.pivot || null,
    angle: details.angle ?? null,
    axis: details.axis || null,
    point: details.point || null,
    routeSnapshot: details.routeSnapshot || null,
  };
}

export function routeSnapshot(route) {
  if (!route) return null;

  return {
    id: route.id,
    nodeCount: route.nodes?.length || 0,
    segmentCount: route.segments?.length || 0,
    componentCount: route.components?.length || 0,
  };
}

export function findRouteTargetKind(route, targetId) {
  if (!route || !targetId) return 'route';

  if ((route.segments || []).some((segment) => segment.id === targetId)) {
    return 'segment';
  }

  if ((route.nodes || []).some((node) => node.id === targetId)) {
    return 'node';
  }

  if (route.id === targetId) return 'route';

  return 'route';
}
