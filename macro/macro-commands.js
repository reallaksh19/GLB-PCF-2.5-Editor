import { beginRoute, consumePendingElbow, requireActiveRoute, routeEnd, routeQueueElbow, routeRunDelta, routeStart } from './macro-route.js';
import { parseDraftCommandOrThrow } from '../editor/draft-command-parser.js';
import { validateMatrixInput } from './validate-matrix-input.js';
import { buildPipelineSpec, looksLikeDraftToken, resolveMacroDraftSequence, resolveMacroLine, routeEngineOrThrow, summarizePoint } from './macro-draft-parity.js';
import { findRouteTargetKind, parseMacroRouteKv, parseRouteDeltaToken, routeById, routeEditResult, routeEngineOrThrow as routeEditEngineOrThrow, routeIdFromOptsOrActive, routeSnapshot } from './macro-route-edit-results.js';
import { formatDerivedMessage, formatRouteDetailMessage, formatRouteInventoryMessage, getRouteInventoryDetail, listDerivedRouteComponents, listRouteInventory, parseRouteInventoryArgs, resolveInventoryRouteId, routeInventoryEngineOrThrow } from './macro-route-inventory.js';
import { clearMacroRoute, currentMacroRoute, useMacroRoute } from './macro-route-session.js';

const _commands = new Map();
export function getCommandHandler(name) { return _commands.get(String(name || '').toUpperCase()) || null; }
getCommandHandler.register = function register(name, handler) { _commands.set(String(name || '').toUpperCase(), handler); };
export function listRegisteredCommandNames() { return [..._commands.keys()].sort((a, b) => a.localeCompare(b)); }
const register = (name, handler) => _commands.set(String(name || '').toUpperCase(), handler);
const clone = (obj) => JSON.parse(JSON.stringify(obj));
const requireArgs = (args, count, usage) => { if (args.length < count) throw new Error(`Usage: ${usage}`); };
const parseKV = (tokens) => Object.fromEntries((tokens || []).map((t) => {
  const idx = String(t).indexOf('=');
  return idx > 0 ? [String(t).slice(0, idx).trim().toUpperCase(), String(t).slice(idx + 1).trim()] : null;
}).filter(Boolean));
const formatDistance = (a, b) => Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
function nextId(ctx, prefix) {
  ctx.__macroIdCounters ||= {};
  ctx.__macroIdCounters[prefix] = (ctx.__macroIdCounters[prefix] || 0) + 1;
  return `${prefix}-${String(ctx.__macroIdCounters[prefix]).padStart(3, '0')}`;
}
function parseXYZ(token, ctx, mode = 'standard') {
  if (!token) throw new Error('Missing coordinate token');
  const isRelative = String(token).startsWith('@');
  const raw = isRelative ? String(token).slice(1) : String(token);
  const parts = raw.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`Invalid coordinate: ${token}`);
  const base = mode === 'route-delta' ? { x: 0, y: 0, z: 0 } : (isRelative ? (ctx.lastPoint || { x: 0, y: 0, z: 0 }) : (ctx.workingOrigin || { x: 0, y: 0, z: 0 }));
  return { x: base.x + parts[0], y: base.y + parts[1], z: base.z + parts[2] };
}
function translatePt(pt, offset) { return pt ? { ...pt, x: pt.x + offset.x, y: pt.y + offset.y, z: pt.z + offset.z } : pt; }
function mirrorPt(pt, plane) {
  if (!pt) return pt;
  const p = { ...pt };
  if (plane === 'XY') p.z = -p.z;
  if (plane === 'XZ') p.y = -p.y;
  if (plane === 'YZ') p.x = -p.x;
  return p;
}
function mapGeometry(comp, ctx, mapper) {
  const cp = clone(comp);
  cp.id = nextId(ctx, String(comp.type || 'item').toLowerCase());
  for (const key of ['origin', 'ep1', 'ep2', 'cp', 'bp']) cp.geometry[key] = mapper(cp.geometry[key]);
  return cp;
}
const withOffset = (comp, offset, ctx) => mapGeometry(comp, ctx, (pt) => translatePt(pt, offset));
const withMirror = (comp, plane, ctx) => mapGeometry(comp, ctx, (pt) => mirrorPt(pt, plane));
function componentBase(type, ctx, label) {
  return {
    id: nextId(ctx, type.toLowerCase()), type, label: label || type,
    geometry: { origin: { x: 0, y: 0, z: 0 }, ep1: null, ep2: null, cp: null, bp: null, bore: null, size: null },
    attributes: {},
    metadata: { source: { macro: '1' }, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] },
  };
}
const resolveBore = (opts, ctx, keys = ['OD', 'BORE']) => Number(keys.map((key) => opts[key]).find((v) => v != null) ?? ctx.defaultOD ?? 168.3);
const pipeAttrs = (opts, ctx, extra = {}) => ({ 'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '', MATERIAL: opts.MAT || ctx.defaultMat || 'CS', ...extra });
function registerCompResult(comp, ctx, message, extra = {}) {
  ctx.lastPoint = comp.geometry.ep2 || comp.geometry.origin || ctx.lastPoint || null;
  ctx.lastEntities = [clone(comp)];
  return { comp, comps: [comp], message, ...extra };
}
function registerCompsResult(comps, ctx, message, extra = {}) {
  if (comps.length) {
    const last = comps[comps.length - 1];
    ctx.lastPoint = last.geometry.ep2 || last.geometry.origin || ctx.lastPoint || null;
    ctx.lastEntities = comps.map(clone);
  }
  return { comps, message, ...extra };
}
const routeSegmentRefs = (route) => (route?.segments || []).map((seg) => ({ id: seg.id, type: 'PIPE', routeId: route.id, segmentId: seg.id }));
function updateRouteMacroContext(ctx, points, route = null) {
  const safePoints = Array.isArray(points) ? points : [];
  ctx.lastPoint = safePoints[safePoints.length - 1] || ctx.lastPoint || null;
  ctx.lastEntities = routeSegmentRefs(route);
}
function routePoints(args, ctx, commandName, errText) {
  const opts = parseKV(args);
  const valueTokens = args.filter((token) => !String(token).includes('='));
  if (opts.START || valueTokens.some((token) => looksLikeDraftToken(token))) return resolveMacroDraftSequence(args, ctx, { commandName, axisLock: opts.AXIS || 'X' }).points;
  if (valueTokens.length) return valueTokens.map((arg) => parseXYZ(arg, ctx));
  if (ctx.matrix) {
    const v = validateMatrixInput(ctx.matrix);
    if (!v.ok) throw new Error(`Invalid matrix input for ${commandName}: ${JSON.stringify(v.errors)}`);
    return v.points;
  }
  throw new Error(errText);
}
function runRouteDelta(ctx, delta, opts, macroInput) {
  requireActiveRoute(ctx);
  const bore = resolveBore(opts, ctx);
  const pending = consumePendingElbow(ctx, delta, opts.R || opts.RADIUS || bore * 1.5);
  const comps = [];
  if (pending) {
    const elbow = componentBase('ELBOW', ctx, `ELBOW ${bore}mm`);
    elbow.geometry = { origin: pending.cp, ep1: pending.ep1, ep2: pending.ep2, cp: pending.cp, bp: null, bore, size: null };
    elbow.attributes = pipeAttrs(opts, ctx, { BORE: String(bore), 'RADIUS-TYPE': String(opts.R || 'LONG').toUpperCase(), 'ROUTE-ELBOW-DIRECTION': pending.direction });
    if (macroInput) elbow.metadata.source.macroInput = macroInput;
    comps.push(elbow);
  }
  const run = routeRunDelta(ctx, delta);
  const pipe = componentBase('PIPE', ctx, `PIPE ${bore}mm`);
  pipe.geometry = { origin: run.start, ep1: run.start, ep2: run.end, cp: null, bp: null, bore, size: null };
  pipe.attributes = pipeAttrs(opts, ctx, { BORE: String(bore) });
  if (macroInput) pipe.metadata.source.macroInput = macroInput;
  comps.push(pipe);
  ctx.routeState.createdIds.push(...comps.map((c) => c.id));
  return { comps, pipe, run };
}

function directPipe(args, ctx) {
  requireArgs(args, 2, 'PIPE x1,y1,z1 x2,y2,z2 [OD=n] [MAT=CS]');
  const ep1 = parseXYZ(args[0], ctx), ep2 = parseXYZ(args[1], ctx), opts = parseKV(args.slice(2)), bore = resolveBore(opts, ctx);
  const comp = componentBase('PIPE', ctx, `PIPE ${bore}mm`);
  comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: null, bore, size: null };
  comp.attributes = pipeAttrs(opts, ctx, { BORE: String(bore) });
  return registerCompResult(comp, ctx, `PIPE created: ${comp.id} (${formatDistance(ep1, ep2)}mm, OD=${bore})`);
}
function directElbow(args, ctx) {
  requireArgs(args, 3, 'ELBOW x1,y1,z1 xc,yc,zc x2,y2,z2 [OD=n] [R=long/short]');
  const ep1 = parseXYZ(args[0], ctx), cp = parseXYZ(args[1], ctx), ep2 = parseXYZ(args[2], ctx), opts = parseKV(args.slice(3)), bore = resolveBore(opts, ctx);
  const comp = componentBase('ELBOW', ctx, `ELBOW ${bore}mm`);
  comp.geometry = { origin: cp, ep1, ep2, cp, bp: null, bore, size: null };
  comp.attributes = pipeAttrs(opts, ctx, { BORE: String(bore), 'RADIUS-TYPE': String(opts.R || 'LONG').toUpperCase() });
  return registerCompResult(comp, ctx, `ELBOW created: ${comp.id}`);
}
function directTee(args, ctx) {
  requireArgs(args, 3, 'TEE x1,y1,z1 x2,y2,z2 xb,yb,zb [OD=n] [BRANCH-OD=n]');
  const ep1 = parseXYZ(args[0], ctx), ep2 = parseXYZ(args[1], ctx), bp = parseXYZ(args[2], ctx), opts = parseKV(args.slice(3));
  const bore = resolveBore(opts, ctx), branchBore = Number(opts['BRANCH-OD'] || opts.BRANCH_OD || bore);
  const comp = componentBase('TEE', ctx, `TEE ${bore}/${branchBore}`);
  comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: { ...bp, bore: branchBore }, bore, size: null };
  comp.attributes = pipeAttrs(opts, ctx, { BORE: String(bore), 'BRANCH-BORE': String(branchBore) });
  return registerCompResult(comp, ctx, `TEE created: ${comp.id}`);
}
function pointComponent(type, usage, args, ctx, build) {
  requireArgs(args, 1, usage);
  return build(parseXYZ(args[0], ctx), parseKV(args.slice(1)));
}
function routeEdit(name, usage, args, ctx, apply, data = () => ({})) {
  requireArgs(args, name === 'ROTATE' ? 3 : 1, usage);
  const { opts, values } = parseMacroRouteKv(args);
  const routeEngine = routeEditEngineOrThrow(ctx);
  const routeId = routeIdFromOptsOrActive(routeEngine, opts, name, ctx);
  const payload = data(values, opts, routeEngine, routeId);
  apply(routeEngine, routeId, payload, opts);
  return routeEditResult(name, { ...payload, routeId, routeSnapshot: routeSnapshot(routeById(routeEngine, routeId)) });
}

export function registerBuiltinCommands() {
  if (_commands.size) return;
  register('POLYLINE', (args, ctx) => {
    const points = routePoints(args, ctx, 'POLYLINE', 'POLYLINE requires point arguments, START= + draft-tokens, or matrix input');
    if (points.length < 2) throw new Error('POLYLINE requires at least two valid points');
    const opts = parseKV(args), routeEngine = routeEngineOrThrow(ctx), spec = buildPipelineSpec(opts, ctx);
    const routeId = routeEngine.createPolyline(points, spec, { source: 'macro-polyline' });
    const route = routeEngine.getRoutes?.().find((r) => r.id === routeId) || null;
    if (!route) throw new Error('Failed to create POLYLINE route');
    updateRouteMacroContext(ctx, points, route);
    return { message: `POLYLINE created route ${routeId} with ${(route.segments || []).length} segments`, routeId, points, segments: routeSegmentRefs(route) };
  });
  register('SPLINE_GUIDE', (args, ctx) => {
    const points = routePoints(args, ctx, 'SPLINE_GUIDE', 'SPLINE_GUIDE requires point arguments or START= + draft-tokens');
    if (points.length < 2) throw new Error('SPLINE_GUIDE requires at least two valid points');
    const opts = parseKV(args), routeEngine = routeEngineOrThrow(ctx);
    const guideId = routeEngine.createGuide(points, 'SPLINE', { source: 'macro-spline-guide', pipelineRef: opts.PIPELINE || ctx.pipeline || undefined });
    ctx.lastPoint = points[points.length - 1];
    ctx.lastEntities = [];
    return { message: `SPLINE_GUIDE created: ${guideId} (${points.length} control points)`, guideId, points };
  });
  register('SPLINE', (args, ctx) => getCommandHandler('SPLINE_GUIDE')(args, ctx));
  register('STRETCH', (args, ctx) => routeEdit('STRETCH', 'STRETCH nodeId dx,dy,dz [ROUTE=routeId]', args, ctx,
    (engine, routeId, p) => engine.stretchNode(routeId, p.nodeId, p.delta, { source: 'macro-stretch' }),
    (values) => ({ message: `STRETCH applied to node ${String(values[0])}`, nodeId: String(values[0]), delta: parseRouteDeltaToken(values[1]) })));
  register('MOVE', (args, ctx) => routeEdit('MOVE', 'MOVE nodeId dx,dy,dz [ROUTE=routeId]', args, ctx,
    (engine, routeId, p) => engine.moveNode(routeId, p.nodeId, p.delta, { source: 'macro-move' }),
    (values) => ({ message: `MOVE applied to node ${String(values[0])}`, nodeId: String(values[0]), delta: parseRouteDeltaToken(values[1]) })));
  register('ROTATE', (args, ctx) => routeEdit('ROTATE', 'ROTATE nodeId1,nodeId2,... angle pivotX,pivotY,pivotZ [AXIS=Z] [ROUTE=routeId]', args, ctx,
    (engine, routeId, p) => engine.rotateNodes(routeId, p.pivot, p.angle, p.axis, p.nodeIds, { source: 'macro-rotate' }),
    (values, opts) => {
      const nodeIds = String(values[0]).split(',').map((item) => item.trim()).filter(Boolean), angle = Number(values[1]);
      if (!Number.isFinite(angle)) throw new Error('ROTATE angle must be numeric');
      return { message: `ROTATE applied to nodes ${nodeIds.join(', ')} by ${angle} degrees`, nodeIds, angle, pivot: parseRouteDeltaToken(values[2]), axis: String(opts.AXIS || 'Z').toUpperCase() };
    }));
  register('BREAK', (args, ctx) => routeEdit('BREAK', 'BREAK segmentId [x,y,z] [ROUTE=routeId]', args, ctx,
    (engine, routeId, p) => engine.breakSegment(routeId, p.segmentId, p.point, { source: 'macro-break' }),
    (values) => ({ message: `BREAK applied to segment ${String(values[0])}`, segmentId: String(values[0]), point: values[1] ? parseRouteDeltaToken(values[1]) : null })));
  register('DELETE', (args, ctx) => {
    requireArgs(args, 1, 'DELETE segmentId|nodeId|routeId [ROUTE=routeId]');
    const { opts, values } = parseMacroRouteKv(args), targetId = String(values[0]), routeEngine = routeEditEngineOrThrow(ctx);
    const activeRouteId = ctx.activeRouteId || ctx.macroActiveRouteId || routeEngine.getState?.()?.selection?.activeRouteId || null;
    const routeId = opts.ROUTE || opts.ROUTE_ID || opts.ROUTEID || activeRouteId || targetId;
    const route = routeById(routeEngine, routeId) || routeById(routeEngine, activeRouteId);
    const targetKind = findRouteTargetKind(route, targetId);
    const payload = targetKind === 'segment' ? { routeId: route.id, segmentId: targetId } : (targetKind === 'node' ? { routeId: route.id, nodeId: targetId } : { routeId: targetId });
    routeEngine.execute({ type: 'ROUTE_DELETE', payload, meta: { source: 'macro-delete' } });
    return routeEditResult('DELETE', { message: `DELETE applied to ${targetKind} ${targetId}`, routeId: route?.id || targetId, targetId, routeSnapshot: routeSnapshot(routeById(routeEngine, route?.id || targetId)) });
  });
  register('USE_ROUTE', (args, ctx) => useMacroRoute(args, ctx));
  register('CURRENT_ROUTE', (_args, ctx) => currentMacroRoute(ctx));
  register('CLEAR_ROUTE', (_args, ctx) => clearMacroRoute(ctx));
  register('ROUTES', (_args, ctx) => {
    const routes = listRouteInventory(routeInventoryEngineOrThrow(ctx));
    return { message: formatRouteInventoryMessage(routes), count: routes.length, routes };
  });
  register('ROUTE_INFO', (args, ctx) => {
    const routeEngine = routeInventoryEngineOrThrow(ctx), routeId = resolveInventoryRouteId(parseRouteInventoryArgs(args), routeEngine, ctx);
    if (!routeId) throw new Error('ROUTE_INFO requires ROUTE=routeId, a positional routeId, or an active route');
    const route = getRouteInventoryDetail(routeEngine, routeId);
    return { message: formatRouteDetailMessage(route), routeId, route };
  });
  register('ROUTE_DERIVED', (args, ctx) => {
    const routeEngine = routeInventoryEngineOrThrow(ctx), routeId = resolveInventoryRouteId(parseRouteInventoryArgs(args), routeEngine, ctx);
    const components = listDerivedRouteComponents(routeEngine, routeId);
    return { message: formatDerivedMessage(components, routeId), routeId, count: components.length, components };
  });
  register('PIPE', directPipe);
  register('ELBOW', (args, ctx) => {
    if (ctx.routeState?.active && args.length >= 2 && /^\d+$/.test(String(args[0]))) {
      const queued = routeQueueElbow(ctx, args[0], args[1]);
      return { message: `ROUTE elbow queued: ${queued.angle}° ${queued.dirToken}` };
    }
    return directElbow(args, ctx);
  });
  register('TEE', (args, ctx) => {
    if (ctx.routeState?.active && args[0] && String(args[0]).toUpperCase().startsWith('BRANCH-OD')) {
      const opts = parseKV(args), rs = requireActiveRoute(ctx);
      if (!rs.lastPoint) throw new Error('TEE in ROUTE mode requires an active last point');
      const branchDelta = parseXYZ(String(opts.BRANCH || '0,1000,0'), ctx, 'route-delta');
      const bp = { x: rs.lastPoint.x + branchDelta.x, y: rs.lastPoint.y + branchDelta.y, z: rs.lastPoint.z + branchDelta.z };
      const bore = Number(opts.OD || ctx.defaultOD || 168.3), branchBore = Number(opts['BRANCH-OD'] || opts.BRANCH_OD || bore);
      const comp = componentBase('TEE', ctx, `TEE ${bore}/${branchBore}`);
      comp.geometry = { origin: rs.lastPoint, ep1: rs.lastPoint, ep2: rs.lastPoint, cp: null, bp: { ...bp, bore: branchBore }, bore, size: null };
      comp.attributes = pipeAttrs(opts, ctx, { BORE: String(bore), 'BRANCH-BORE': String(branchBore) });
      ctx.routeState.createdIds.push(comp.id);
      return registerCompResult(comp, ctx, `ROUTE tee created: ${comp.id}`);
    }
    return directTee(args, ctx);
  });
  register('FLANGE', (args, ctx) => pointComponent('FLANGE', 'FLANGE x,y,z [OD=n] [RATING=150]', args, ctx, (origin, opts) => {
    const bore = resolveBore(opts, ctx), comp = componentBase('FLANGE', ctx, `FLANGE ${bore}mm`);
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore, size: null };
    comp.attributes = pipeAttrs(opts, ctx, { BORE: String(bore), RATING: String(opts.RATING || '150'), TYPE: String(opts.TYPE || 'WN').toUpperCase() });
    return registerCompResult(comp, ctx, `FLANGE created: ${comp.id} (RATING=${comp.attributes.RATING})`);
  }));
  register('VALVE', (args, ctx) => pointComponent('VALVE', 'VALVE x,y,z [OD=n] [TYPE=GATE/BALL/CHECK]', args, ctx, (origin, opts) => {
    const bore = resolveBore(opts, ctx), comp = componentBase('VALVE', ctx, `VALVE ${bore}mm`);
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore, size: null };
    comp.attributes = pipeAttrs(opts, ctx, { BORE: String(bore), 'VALVE-TYPE': String(opts.TYPE || 'GATE').toUpperCase() });
    return registerCompResult(comp, ctx, `VALVE created: ${comp.id} (${comp.attributes['VALVE-TYPE']})`);
  }));
  register('REDUCER', (args, ctx) => {
    requireArgs(args, 2, 'REDUCER x1,y1,z1 x2,y2,z2 [OD1=n] [OD2=n]');
    const ep1 = parseXYZ(args[0], ctx), ep2 = parseXYZ(args[1], ctx), opts = parseKV(args.slice(2));
    const od1 = Number(opts.OD1 || ctx.defaultOD || 168.3), od2 = Number(opts.OD2 || opts.OD || od1 / 2), comp = componentBase('REDUCER', ctx, `REDUCER ${od1}/${od2}`);
    comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: null, bore: od1, size: null };
    comp.attributes = pipeAttrs(opts, ctx, { OD1: String(od1), OD2: String(od2), TYPE: String(opts.TYPE || 'CONCENTRIC').toUpperCase() });
    return registerCompResult(comp, ctx, `REDUCER created: ${comp.id} (${od1}→${od2})`);
  });
  register('SUPPORT', (args, ctx) => pointComponent('SUPPORT', 'SUPPORT x,y,z [KIND=REST/GUIDE/ANCHOR] [NAME=S-01]', args, ctx, (origin, opts) => {
    const kind = String(opts.KIND || 'REST').toUpperCase(), name = String(opts.NAME || ''), comp = componentBase('SUPPORT', ctx, name || `SUPPORT ${kind}`);
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore: null, size: null };
    comp.attributes = { 'SUPPORT-TYPE': kind, 'SUPPORT-KIND': kind, 'SUPPORT-NAME': name, '<SUPPORT_NAME>': name, 'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '' };
    return registerCompResult(comp, ctx, `SUPPORT created: ${comp.id} (${kind})`);
  }));
  register('LABEL', (args, ctx) => {
    requireArgs(args, 2, 'LABEL x,y,z "text"');
    const origin = parseXYZ(args[0], ctx), text = args.slice(1).join(' ').trim(), comp = componentBase('MESSAGE-SQUARE', ctx, text || 'LABEL');
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore: null, size: null };
    comp.metadata.squareText = text;
    comp.metadata.squarePos = origin;
    return registerCompResult(comp, ctx, `LABEL created: ${comp.id}`);
  });
  register('CIRCLE', (args, ctx) => {
    requireArgs(args, 1, 'CIRCLE cx,cy,cz RADIUS=n  — or —  CIRCLE cx,cy,cz rp,rq,rr (radius point)');
    const center = parseXYZ(args[0], ctx), opts = parseKV(args.slice(1));
    let radius = Number(opts.RADIUS || opts.R || 0);
    if (!radius && args[1] && !String(args[1]).includes('=')) {
      const rPt = parseXYZ(args[1], ctx);
      radius = Math.sqrt((rPt.x - center.x) ** 2 + (rPt.y - center.y) ** 2 + (rPt.z - center.z) ** 2);
    }
    if (!radius || radius < 1) throw new Error('CIRCLE requires a positive RADIUS= value or a radius point');
    const comp = componentBase('CIRCLE_SHAPE', ctx, `CIRCLE r=${Math.round(radius)}mm`);
    comp.geometry = { origin: center, ep1: { x: center.x + radius, y: center.y, z: center.z }, ep2: { x: center.x - radius, y: center.y, z: center.z }, bore: radius * 2, radius, cp: null, bp: null, size: null };
    comp.attributes = { RADIUS: String(radius), TYPE: 'CIRCLE_SHAPE' };
    return registerCompResult(comp, ctx, `CIRCLE created: ${comp.id} (center=${center.x},${center.y},${center.z} r=${Math.round(radius)}mm)`);
  });
  register('ARC', (args, ctx) => {
    requireArgs(args, 3, 'ARC cx,cy,cz  startx,starty,startz  endx,endy,endz');
    const center = parseXYZ(args[0], ctx), ep1 = parseXYZ(args[1], ctx), ep2 = parseXYZ(args[2], ctx);
    const radius = Math.sqrt((ep1.x - center.x) ** 2 + (ep1.y - center.y) ** 2 + (ep1.z - center.z) ** 2);
    if (radius < 1) throw new Error('ARC: start point too close to center (radius < 1 mm)');
    const comp = componentBase('ARC_SHAPE', ctx, `ARC r=${Math.round(radius)}mm`);
    comp.geometry = { origin: center, cp: center, ep1, ep2, bore: radius * 2, radius, bp: null, size: null };
    comp.attributes = { RADIUS: String(radius), TYPE: 'ARC_SHAPE' };
    return registerCompResult(comp, ctx, `ARC created: ${comp.id} (r=${Math.round(radius)}mm)`);
  });
  register('ORIGIN', (args, ctx) => {
    requireArgs(args, 1, 'ORIGIN x,y,z');
    const origin = parseXYZ(args[0], { ...ctx, lastPoint: { x: 0, y: 0, z: 0 }, workingOrigin: { x: 0, y: 0, z: 0 } });
    ctx.workingOrigin = origin;
    ctx.lastPoint = origin;
    return { message: `Working Plane Origin set to ${origin.x},${origin.y},${origin.z}` };
  });
  register('ALIGN', (args, ctx) => { requireArgs(args, 1, 'ALIGN NORTH/EAST/UP'); ctx.workingAlignment = String(args[0]).toUpperCase(); return { message: `Working Plane aligned to ${ctx.workingAlignment}` }; });
  register('ARRAY', (args, ctx) => {
    requireArgs(args, 3, 'ARRAY LAST n dx,dy,dz');
    if (String(args[0]).toUpperCase() !== 'LAST') throw new Error('ARRAY currently supports only LAST');
    const count = Number(args[1]);
    if (!Number.isFinite(count) || count < 1) throw new Error('ARRAY count must be >= 1');
    const delta = parseXYZ(args[2], ctx, 'route-delta'), base = ctx.lastEntities || [];
    if (!base.length) throw new Error('No LAST entity available for ARRAY');
    const comps = [];
    for (let i = 1; i <= count; i++) base.forEach((comp) => comps.push(withOffset(comp, { x: delta.x * i, y: delta.y * i, z: delta.z * i }, ctx)));
    return registerCompsResult(comps, ctx, `ARRAY created: ${comps.length} copied component(s)`);
  });
  register('MIRROR', (args, ctx) => {
    requireArgs(args, 2, 'MIRROR LAST PLANE=XY/XZ/YZ');
    if (String(args[0]).toUpperCase() !== 'LAST') throw new Error('MIRROR currently supports only LAST');
    const plane = String(parseKV(args.slice(1)).PLANE || '').toUpperCase();
    if (!['XY', 'XZ', 'YZ'].includes(plane)) throw new Error('MIRROR requires PLANE=XY/XZ/YZ');
    const base = ctx.lastEntities || [];
    if (!base.length) throw new Error('No LAST entity available for MIRROR');
    const comps = base.map((comp) => withMirror(comp, plane, ctx));
    return registerCompsResult(comps, ctx, `MIRROR created: ${comps.length} mirrored component(s)`);
  });
  register('ROUTE', (args, ctx) => { const opts = parseKV(args); beginRoute(ctx, opts); return { message: `ROUTE mode started${opts.PIPELINE ? ` (${opts.PIPELINE})` : ''}` }; });
  register('START', (args, ctx) => { requireArgs(args, 1, 'START x,y,z'); const pt = parseXYZ(args[0], ctx); routeStart(ctx, pt); return { message: `ROUTE start set at ${pt.x},${pt.y},${pt.z}` }; });
  register('LINE', (args, ctx) => {
    const resolved = resolveMacroLine(args, ctx), routeEngine = routeEngineOrThrow(ctx), spec = buildPipelineSpec(resolved.opts, ctx);
    const routeId = routeEngine.createPolyline(resolved.points, spec, { source: 'macro-line', token: resolved.token, mode: resolved.mode });
    const route = routeEngine.getRoutes?.().find((r) => r.id === routeId) || null;
    if (!route) throw new Error('Failed to create LINE route');
    updateRouteMacroContext(ctx, resolved.points, route);
    return { message: `LINE created route ${routeId} from ${summarizePoint(resolved.startPoint)} to ${summarizePoint(resolved.endPoint)}`, routeId, points: resolved.points, segments: routeSegmentRefs(route) };
  });
  register('RUN', (args, ctx) => {
    requireArgs(args, 1, 'RUN dx,dy,dz');
    const rs = requireActiveRoute(ctx);
    if (!rs.lastPoint) throw new Error('ROUTE START must be issued before RUN');
    let delta = null, macroInput = null;
    try { delta = parseXYZ(args[0], ctx, 'route-delta'); }
    catch (_legacyParseError) {
      const parsed = parseDraftCommandOrThrow(String(args[0] || ''), rs.lastPoint, { axisLock: 'X' });
      delta = parsed.delta;
      macroInput = parsed.commandText;
    }
    const result = runRouteDelta(ctx, delta, parseKV(args.slice(1)), macroInput);
    return registerCompsResult(result.comps, ctx, `RUN created: ${result.pipe.id} (${formatDistance(result.run.start, result.run.end)}mm)`);
  });
  register('END', (_args, ctx) => { const summary = routeEnd(ctx); return { message: `ROUTE ended: ${summary.count} component(s) from route state` }; });
  register('LIST', (args, ctx) => {
    const wanted = args[0] ? String(args[0]).toUpperCase() : null;
    const comps = (ctx.getComponents?.() || []).filter((comp) => !wanted || String(comp.type).toUpperCase() === wanted);
    return { message: `${wanted || 'ALL'} count: ${comps.length}`, lines: comps.map((comp) => `${comp.id}  ${comp.type}  ${comp.label || ''}`) };
  });
  register('DIST', (args, ctx) => { requireArgs(args, 2, 'DIST x1,y1,z1 x2,y2,z2'); return { message: `Distance: ${formatDistance(parseXYZ(args[0], ctx), parseXYZ(args[1], ctx))} mm` }; });
  register('INSPECT', (args, ctx) => {
    requireArgs(args, 1, 'INSPECT id');
    const id = String(args[0]), comp = (ctx.getComponents?.() || []).find((c) => c.id === id);
    if (!comp) throw new Error(`No component found with id: ${id}`);
    return { message: `${comp.id} ${comp.type}`, lines: [`label=${comp.label || ''}`, `origin=${JSON.stringify(comp.geometry?.origin || null)}`, `attrs=${JSON.stringify(comp.attributes || {})}`] };
  });
  register('VALIDATE', (_args, ctx) => {
    const results = ctx.getDomain?.()?.validate?.(ctx.getComponents?.() || []) || [];
    const lines = results.map((r) => `${String(r.severity || 'info').toUpperCase()} ${r.code}: ${r.message}${r.compId ? ` [${r.compId}]` : ''}`);
    return { message: `Validation results: ${results.length}`, lines };
  });
}
