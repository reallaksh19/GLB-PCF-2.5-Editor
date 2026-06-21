import {
  parseMacroRouteKv,
  routeById,
  routeEngineOrThrow,
  routeIdFromOptsOrActive,
  routeSnapshot,
} from './macro-route-edit-results.js';

const EPS_MM = 0.001;

export const MACRO_ROUTE_BREAK_SUPPORT_COMMANDS = Object.freeze(['BREAK_PIPE', 'PIPE_BREAK', 'SUPPORT_ATTACH', 'ATTACH_SUPPORT']);

export function registerMacroRouteBreakSupportCommands(register) {
  if (typeof register !== 'function') throw new Error('registerMacroRouteBreakSupportCommands requires a register function');
  register('BREAK_PIPE', (args, ctx) => breakPipe(args, ctx));
  register('PIPE_BREAK', (args, ctx) => breakPipe(args, ctx));
  register('SUPPORT_ATTACH', (args, ctx) => attachSupport(args, ctx));
  register('ATTACH_SUPPORT', (args, ctx) => attachSupport(args, ctx));
}

function breakPipe(args, ctx) {
  const { opts, values } = parseMacroRouteKv(args);
  const routeEngine = routeEngineOrThrow(ctx);
  const routeId = routeIdFromOptsOrActive(routeEngine, opts, 'BREAK_PIPE', ctx);
  const segmentId = resolveSegmentId(values, opts);
  const point = resolvePoint(values, opts);
  if (!segmentId || !point) throw new Error('BREAK_PIPE requires segmentId and x,y,z point');

  routeEngine.breakSegment(routeId, segmentId, point, { source: 'macro-break-pipe' });
  const route = routeById(routeEngine, routeId);
  const node = findNodeAtPoint(route, point);

  return {
    message: `BREAK_PIPE applied to ${segmentId}${node ? ` at node ${node.id}` : ''}`,
    kind: 'BREAK_PIPE',
    routeId,
    segmentId,
    nodeId: node?.id || null,
    point,
    routeSnapshot: routeSnapshot(route),
  };
}

function attachSupport(args, ctx) {
  const { opts, values } = parseMacroRouteKv(args);
  const routeEngine = routeEngineOrThrow(ctx);
  const routeId = routeIdFromOptsOrActive(routeEngine, opts, 'SUPPORT_ATTACH', ctx);
  const point = resolvePoint(values, opts);
  if (!point) throw new Error('SUPPORT_ATTACH requires x,y,z point');

  const before = routeById(routeEngine, routeId);
  const segmentId = resolveSegmentId(values, opts);
  let node = findNodeAtPoint(before, point);

  if (!node) {
    if (!segmentId) throw new Error('SUPPORT_ATTACH point is not an existing route node; provide SEGMENT=... to create/reuse a break node first');
    routeEngine.breakSegment(routeId, segmentId, point, { source: 'macro-support-attach-break' });
    node = findNodeAtPoint(routeById(routeEngine, routeId), point);
  }
  if (!node) throw new Error('SUPPORT_ATTACH could not resolve a route node at the support point');

  const supportId = opts.NAME || opts.ID || `support:${routeId}:${node.id}`;
  const supportType = String(opts.KIND || opts.TYPE || opts.SUPPORT_TYPE || 'REST').toUpperCase();
  routeEngine.insertComponent({
    id: supportId,
    component: 'SUPPORT',
    routeId,
    point,
    supportType,
    supportName: supportId,
    attach: opts.ATTACH || opts.ATTACHMENT || '',
    nodeId: node.id,
    segmentId: segmentId || '',
    provenance: opts.PROVENANCE || 'macro-support-attach',
  }, { source: 'macro-support-attach' });

  return {
    message: `SUPPORT_ATTACH ${supportType} at node ${node.id}`,
    kind: 'SUPPORT_ATTACH',
    routeId,
    segmentId: segmentId || null,
    nodeId: node.id,
    supportId,
    supportType,
    point,
    routeSnapshot: routeSnapshot(routeById(routeEngine, routeId)),
    components: routeEngine.getInlineComponents?.() || routeEngine.getState?.()?.model?.components || [],
  };
}

function resolveSegmentId(values, opts) {
  return stringValue(opts.SEGMENT || opts.SEGMENT_ID || opts.SEGMENTID || values.find((value) => !looksLikePoint(value)));
}

function resolvePoint(values, opts) {
  const raw = opts.POINT || opts.AT || values.find(looksLikePoint);
  return raw ? parsePoint(raw) : null;
}

function parsePoint(token) {
  const parts = String(token || '').split(',').map((value) => Number(value.trim()));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) throw new Error(`Invalid route point: ${token}`);
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function looksLikePoint(value) {
  return String(value || '').includes(',');
}

function findNodeAtPoint(route, point) {
  return (route?.nodes || []).find((node) => samePoint(node, point)) || null;
}

function samePoint(a, b) {
  return !!a && !!b && Math.abs(a.x - b.x) <= EPS_MM && Math.abs(a.y - b.y) <= EPS_MM && Math.abs(a.z - b.z) <= EPS_MM;
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}
