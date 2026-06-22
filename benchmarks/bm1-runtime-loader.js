import { CommandTypes, createCommand } from '../editor/command-types.js';
import { BM1_CENTERLINE_FIXTURE } from './bm1-centerline.fixture.js';

export const BM1_RUNTIME_LOADER_VERSION = 'bm1-runtime-loader/v1';
export const BM1_RUNTIME_ROUTE_IDS = Object.freeze({
  MAIN: 'BM1-MAIN-ROUTE',
  BRANCH: 'BM1-BRANCH-ROUTE',
});

export function loadBm1FixtureIntoRouteEngine(routeEngine, fixture = BM1_CENTERLINE_FIXTURE) {
  if (!routeEngine || typeof routeEngine.createPolyline !== 'function' || typeof routeEngine.getRoutes !== 'function') {
    throw new Error('loadBm1FixtureIntoRouteEngine requires a routeEngine with createPolyline() and getRoutes()');
  }

  const routeDefs = buildBm1RouteDefinitions(fixture);
  const routeIds = routeDefs.map((route) => route.id);
  const beforeRoutes = routeEngine.getRoutes?.() || [];
  const existingMatches = routeDefs.every((routeDef) => routeMatchesDefinition(beforeRoutes.find((route) => route.id === routeDef.id), routeDef));

  if (existingMatches) {
    return loaderResult('existing', fixture, routeDefs, routeEngine, { removedRoutes: 0, removedComponents: 0 });
  }

  const removedComponents = removeBm1Components(routeEngine, routeIds);
  const removedRoutes = removeBm1Routes(routeEngine, routeIds);

  for (const routeDef of routeDefs) {
    routeEngine.createPolyline(routeDef.points, routeDef.spec, {
      routeId: routeDef.id,
      source: 'bm1-runtime-loader',
      benchmarkId: fixture.id,
      routeRole: routeDef.role,
    });
  }

  return loaderResult(removedRoutes || removedComponents ? 'recreated' : 'created', fixture, routeDefs, routeEngine, { removedRoutes, removedComponents });
}

export function buildBm1RouteDefinitions(fixture = BM1_CENTERLINE_FIXTURE) {
  const specs = Object.fromEntries((fixture.specs || []).map((spec) => [spec.id, spec]));
  return ['MAIN', 'BRANCH'].map((specId) => ({
    id: BM1_RUNTIME_ROUTE_IDS[specId],
    role: specId,
    spec: normalizeRouteSpec(specs[specId], specId, fixture),
    points: routePointsForSpec(fixture, specId),
    pointIds: routePointIdsForSpec(fixture, specId),
  }));
}

function loaderResult(mode, fixture, routeDefs, routeEngine, counts) {
  const routes = routeEngine.getRoutes?.() || [];
  const inlineComponents = routeEngine.getInlineComponents?.() || routeEngine.getState?.()?.model?.components || [];
  return {
    id: fixture.id,
    version: BM1_RUNTIME_LOADER_VERSION,
    runtimeLoaded: true,
    mode,
    fixtureId: fixture.id,
    routeIds: routeDefs.map((route) => route.id),
    routes: routeDefs.map((routeDef) => routeSnapshot(routes.find((route) => route.id === routeDef.id), routeDef)),
    componentCount: inlineComponents.length,
    removedRoutes: counts.removedRoutes,
    removedComponents: counts.removedComponents,
    fixture,
  };
}

function routeSnapshot(route, routeDef) {
  return {
    id: routeDef.id,
    role: routeDef.role,
    pointIds: [...routeDef.pointIds],
    points: (route?.nodes || []).map((node) => ({ x: node.x, y: node.y, z: node.z })),
    spec: { ...(route?.spec || routeDef.spec) },
    loaded: !!route,
  };
}

function routePointIdsForSpec(fixture, specId) {
  const ids = [];
  for (const segment of fixture.segments || []) {
    if (segment.spec !== specId) continue;
    if (!ids.length) ids.push(segment.from);
    for (const splitId of splitNodeIdsForSegment(fixture, segment)) ids.push(splitId);
    ids.push(segment.to);
  }
  return ids;
}

function routePointsForSpec(fixture, specId) {
  return routePointIdsForSpec(fixture, specId).map((nodeId) => pointForNode(fixture, nodeId));
}

function splitNodeIdsForSegment(fixture, segment) {
  const from = pointForNode(fixture, segment.from);
  const to = pointForNode(fixture, segment.to);
  return (fixture.features || [])
    .filter((feature) => feature.type === 'BREAK' && feature.onSegment === segment.id && feature.at)
    .map((feature) => ({ id: feature.at, fraction: pointFraction(pointForNode(fixture, feature.at), from, to) }))
    .sort((a, b) => a.fraction - b.fraction)
    .map((entry) => entry.id);
}

function pointForNode(fixture, nodeId) {
  const node = (fixture.nodes || []).find((item) => item.id === nodeId);
  if (!node) throw new Error(`BM1 fixture node not found: ${nodeId}`);
  return { x: node.x, y: node.y, z: node.z };
}

function pointFraction(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq <= 0) return 0;
  return ((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) / lenSq;
}

function normalizeRouteSpec(spec, specId, fixture) {
  if (!spec) throw new Error(`BM1 fixture spec not found: ${specId}`);
  return withoutEmpty({
    source: fixture.id,
    sourceSpecId: spec.id,
    size: spec.size,
    nominalSize: spec.nominalSize || spec.size,
    sch: spec.sch,
    schedule: spec.schedule || spec.sch,
    class: spec.class,
    rating: spec.rating || spec.class,
    material: spec.material,
    standard: spec.standard,
  });
}

function routeMatchesDefinition(route, routeDef) {
  if (!route) return false;
  if (!sameSpec(route.spec || {}, routeDef.spec)) return false;
  const nodes = route.nodes || [];
  if (nodes.length !== routeDef.points.length) return false;
  return routeDef.points.every((point, index) => samePoint(nodes[index], point));
}

function sameSpec(actual, expected) {
  return Object.entries(expected).every(([key, value]) => String(actual[key] ?? '') === String(value));
}

function removeBm1Routes(routeEngine, routeIds) {
  const routes = routeEngine.getRoutes?.() || [];
  let removed = 0;
  for (const route of routes) {
    if (!routeIds.includes(route.id)) continue;
    executeRouteEngineCommand(routeEngine, CommandTypes.ROUTE_DELETE, { routeId: route.id });
    removed += 1;
  }
  return removed;
}

function removeBm1Components(routeEngine, routeIds) {
  const components = routeEngine.getInlineComponents?.() || routeEngine.getState?.()?.model?.components || [];
  let removed = 0;
  for (const component of components) {
    if (!routeIds.includes(componentRouteId(component))) continue;
    executeRouteEngineCommand(routeEngine, CommandTypes.DELETE_COMPONENT, { id: component.id, routeId: componentRouteId(component) });
    removed += 1;
  }
  return removed;
}

function executeRouteEngineCommand(routeEngine, type, payload) {
  if (typeof routeEngine.execute !== 'function') throw new Error(`BM1 runtime loader requires routeEngine.execute() for ${type}`);
  routeEngine.execute(createCommand(type, payload, { source: 'bm1-runtime-loader' }));
}

function componentRouteId(component) {
  return component?.routeId || component?.metadata?.source?.routeId || component?.attributes?.ROUTE_ID || component?.attributes?.ROUTE || '';
}

function samePoint(a, b) {
  return !!a && !!b && Math.abs(a.x - b.x) <= 0.001 && Math.abs(a.y - b.y) <= 0.001 && Math.abs(a.z - b.z) <= 0.001;
}

function withoutEmpty(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}
