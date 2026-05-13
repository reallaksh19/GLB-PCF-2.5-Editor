function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clonePoint(point) {
  return {
    x: finiteNumber(point?.x, 0),
    y: finiteNumber(point?.y, 0),
    z: finiteNumber(point?.z, 0),
  };
}

export function parseRouteInventoryArgs(tokens = []) {
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

export function routeInventoryEngineOrThrow(ctx = {}) {
  const routeEngine = ctx.getRouteEngine?.();

  if (!routeEngine) {
    throw new Error('ROUTE engine not initialized');
  }

  return routeEngine;
}

export function resolveInventoryRouteId(args = {}, routeEngine = null) {
  const opts = args.opts || {};
  const values = args.values || [];

  if (opts.ROUTE || opts.ROUTE_ID || opts.ROUTEID) {
    return opts.ROUTE || opts.ROUTE_ID || opts.ROUTEID;
  }

  if (values[0]) return String(values[0]);

  return routeEngine?.getState?.()?.selection?.activeRouteId || null;
}

export function routeToInventorySummary(route = {}) {
  return {
    id: route.id || '',
    nodeCount: route.nodes?.length || 0,
    segmentCount: route.segments?.length || 0,
    componentCount: route.components?.length || 0,
    spec: route.spec || {},
  };
}

export function routeToInventoryDetail(route = {}) {
  return {
    ...routeToInventorySummary(route),
    nodes: (route.nodes || []).map((node) => ({
      id: node.id,
      x: finiteNumber(node.x, 0),
      y: finiteNumber(node.y, 0),
      z: finiteNumber(node.z, 0),
      point: clonePoint(node),
    })),
    segments: (route.segments || []).map((segment) => ({
      id: segment.id,
      from: segment.from || '',
      to: segment.to || '',
      kind: segment.kind || 'PIPE',
      orientation: segment.orientation || '',
    })),
    components: (route.components || []).map((component) => ({
      id: component.id,
      type: component.type || component.component || '',
    })),
  };
}

export function listRouteInventory(routeEngine) {
  return (routeEngine.getRoutes?.() || []).map(routeToInventorySummary);
}

export function getRouteInventoryDetail(routeEngine, routeId) {
  const routes = routeEngine.getRoutes?.() || [];
  const route = routes.find((item) => item.id === routeId) || null;

  if (!route) {
    throw new Error(`Route not found: ${routeId || 'unknown'}`);
  }

  return routeToInventoryDetail(route);
}

function routeIdFromDerivedComponent(comp = {}) {
  const attrs = comp.attributes || {};
  return (
    attrs.ROUTE_ID ||
    attrs['ROUTE_ID'] ||
    comp.metadata?.source?.routeId ||
    comp.routeId ||
    ''
  );
}

export function listDerivedRouteComponents(routeEngine, routeId = null) {
  const all = routeEngine.getDerivedComponents?.() || [];

  return all
    .filter((comp) => {
      if (!routeId) return true;
      return routeIdFromDerivedComponent(comp) === routeId;
    })
    .map((comp) => ({
      id: comp.id || '',
      type: comp.type || '',
      routeId: routeIdFromDerivedComponent(comp),
      segmentId: comp.attributes?.SEGMENT_ID || comp.metadata?.source?.segmentId || '',
      label: comp.label || '',
    }));
}

export function formatRouteInventoryMessage(rows = []) {
  if (!rows.length) return 'ROUTES: none';

  return `ROUTES: ${rows.length} route(s) — ${rows
    .map((row) => `${row.id} [nodes=${row.nodeCount}, segments=${row.segmentCount}]`)
    .join('; ')}`;
}

export function formatRouteDetailMessage(detail = {}) {
  return `ROUTE_INFO ${detail.id}: ${detail.nodeCount} node(s), ${detail.segmentCount} segment(s)`;
}

export function formatDerivedMessage(components = [], routeId = null) {
  const scope = routeId ? ` ${routeId}` : '';
  return `ROUTE_DERIVED${scope}: ${components.length} component(s)`;
}
