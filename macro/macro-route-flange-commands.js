import {
  parseMacroRouteKv,
  routeById,
  routeEngineOrThrow,
  routeIdFromOptsOrActive,
  routeSnapshot,
} from './macro-route-edit-results.js';

const EPS_MM = 0.001;

export const MACRO_ROUTE_FLANGE_COMMANDS = Object.freeze(['FLANGE_PAIR', 'FLANGEPAIR']);

export function registerMacroRouteFlangeCommands(register) {
  if (typeof register !== 'function') throw new Error('registerMacroRouteFlangeCommands requires a register function');
  register('FLANGE_PAIR', (args, ctx) => flangePair(args, ctx));
  register('FLANGEPAIR', (args, ctx) => flangePair(args, ctx));
}

function flangePair(args, ctx) {
  const { opts, values } = parseMacroRouteKv(args);
  const routeEngine = routeEngineOrThrow(ctx);
  const routeId = routeIdFromOptsOrActive(routeEngine, opts, 'FLANGE_PAIR', ctx);
  const route = routeById(routeEngine, routeId);
  const point = resolvePoint(values, opts, route);
  if (!point) throw new Error('FLANGE_PAIR requires an existing NODE=... or x,y,z point on the route centerline');
  const node = resolveNode(values, opts, route, point);
  if (!node) throw new Error('FLANGE_PAIR point must match an existing route node in CENTERLINE mode');

  const flangeId = opts.NAME || opts.ID || `flange-pair:${routeId}:${node.id}`;
  routeEngine.insertComponent({
    id: flangeId,
    component: 'FLANGE_PAIR',
    routeId,
    point,
    nodeId: node.id,
    flangeType: opts.FLANGE_TYPE || opts.TYPE || 'WN',
    subtype: opts.FLANGE_TYPE || opts.TYPE || 'WN',
    facing: opts.FACING || 'RF',
    rating: opts.CLASS || opts.RATING || route?.spec?.class || route?.spec?.rating || '',
    size: opts.SIZE || opts.NPS || route?.spec?.size || route?.spec?.nominalSize || '',
    endType: opts.END_TYPE || opts.ENDTYPE || '',
    provenance: opts.PROVENANCE || 'macro-flange-pair',
    matchKey: opts.MATCHKEY || opts.MATCH_KEY || '',
    pipelineRef: route?.spec?.pipelineRef || route?.spec?.pipeline || 'ROUTE-AUTHORED',
  }, { source: 'macro-flange-pair' });

  const components = routeEngine.getInlineComponents?.() || routeEngine.getState?.()?.model?.components || [];
  return {
    message: `FLANGE_PAIR inserted at node ${node.id}`,
    kind: 'FLANGE_PAIR',
    routeId,
    nodeId: node.id,
    flangeId,
    point,
    routeSnapshot: routeSnapshot(routeById(routeEngine, routeId)),
    components,
    componentCount: components.length,
  };
}

function resolveNode(values, opts, route, point) {
  const nodeId = stringValue(opts.NODE || opts.NODE_ID || opts.NODEID || values.find((value) => !looksLikePoint(value)));
  if (nodeId) return (route?.nodes || []).find((node) => node.id === nodeId) || null;
  return findNodeAtPoint(route, point);
}

function resolvePoint(values, opts, route) {
  const nodeId = stringValue(opts.NODE || opts.NODE_ID || opts.NODEID || values.find((value) => !looksLikePoint(value)));
  if (nodeId) {
    const node = (route?.nodes || []).find((item) => item.id === nodeId);
    return node ? { x: node.x, y: node.y, z: node.z } : null;
  }
  const raw = opts.POINT || opts.AT || values.find(looksLikePoint);
  return raw ? parsePoint(raw) : null;
}

function parsePoint(token) {
  const parts = String(token || '').split(',').map((value) => Number(value.trim()));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) throw new Error(`Invalid route point: ${token}`);
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function findNodeAtPoint(route, point) {
  return (route?.nodes || []).find((node) => samePoint(node, point)) || null;
}

function samePoint(a, b) {
  return !!a && !!b && Math.abs(a.x - b.x) <= EPS_MM && Math.abs(a.y - b.y) <= EPS_MM && Math.abs(a.z - b.z) <= EPS_MM;
}

function looksLikePoint(value) {
  return String(value || '').includes(',');
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}
