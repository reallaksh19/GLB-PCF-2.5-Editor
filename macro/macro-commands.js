import { beginRoute, consumePendingElbow, requireActiveRoute, routeEnd, routeQueueElbow, routeRunDelta, routeStart } from './macro-route.js';

const _commands = new Map();

export function getCommandHandler(name) {
  return _commands.get(String(name || '').toUpperCase()) || null;
}
getCommandHandler.register = function register(name, handler) {
  _commands.set(String(name || '').toUpperCase(), handler);
};

function register(name, handler) {
  _commands.set(String(name || '').toUpperCase(), handler);
}

function nextId(ctx, prefix) {
  ctx.__macroIdCounters ||= {};
  ctx.__macroIdCounters[prefix] = (ctx.__macroIdCounters[prefix] || 0) + 1;
  return `${prefix}-${String(ctx.__macroIdCounters[prefix]).padStart(3, '0')}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function translatePt(pt, offset) {
  if (!pt) return pt;
  const next = { ...pt, x: pt.x + offset.x, y: pt.y + offset.y, z: pt.z + offset.z };
  if (pt.bore != null) next.bore = pt.bore;
  return next;
}

function withOffset(comp, offset, ctx) {
  const cp = clone(comp);
  cp.id = nextId(ctx, String(comp.type || 'item').toLowerCase());
  cp.geometry.origin = translatePt(cp.geometry.origin, offset);
  cp.geometry.ep1 = translatePt(cp.geometry.ep1, offset);
  cp.geometry.ep2 = translatePt(cp.geometry.ep2, offset);
  cp.geometry.cp = translatePt(cp.geometry.cp, offset);
  cp.geometry.bp = translatePt(cp.geometry.bp, offset);
  return cp;
}

function mirrorPt(pt, plane) {
  if (!pt) return pt;
  const p = { ...pt };
  switch (plane) {
    case 'XY': p.z = -p.z; break;
    case 'XZ': p.y = -p.y; break;
    case 'YZ': p.x = -p.x; break;
    default: break;
  }
  return p;
}

function withMirror(comp, plane, ctx) {
  const cp = clone(comp);
  cp.id = nextId(ctx, String(comp.type || 'item').toLowerCase());
  cp.geometry.origin = mirrorPt(cp.geometry.origin, plane);
  cp.geometry.ep1 = mirrorPt(cp.geometry.ep1, plane);
  cp.geometry.ep2 = mirrorPt(cp.geometry.ep2, plane);
  cp.geometry.cp = mirrorPt(cp.geometry.cp, plane);
  cp.geometry.bp = mirrorPt(cp.geometry.bp, plane);
  return cp;
}

function parseXYZ(token, ctx, mode = 'standard') {
  if (!token) throw new Error('Missing coordinate token');
  const isRelative = token.startsWith('@');
  const raw = isRelative ? token.slice(1) : token;
  const parts = raw.split(',').map(v => Number(v.trim()));
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`Invalid coordinate: ${token}`);
  const base = mode === 'route-delta'
    ? { x: 0, y: 0, z: 0 }
    : isRelative
      ? (ctx.lastPoint || { x: 0, y: 0, z: 0 })
      : (ctx.workingOrigin || { x: 0, y: 0, z: 0 });
  return { x: base.x + parts[0], y: base.y + parts[1], z: base.z + parts[2] };
}

function parseKV(tokens) {
  const opts = {};
  (tokens || []).forEach(t => {
    const idx = t.indexOf('=');
    if (idx <= 0) return;
    const k = t.slice(0, idx).trim().toUpperCase();
    const v = t.slice(idx + 1).trim();
    opts[k] = v;
  });
  return opts;
}

function componentBase(type, ctx, label) {
  return {
    id: nextId(ctx, type.toLowerCase()),
    type,
    label: label || type,
    geometry: { origin: { x: 0, y: 0, z: 0 }, ep1: null, ep2: null, cp: null, bp: null, bore: null, size: null },
    attributes: {},
    metadata: { source: { macro: '1' }, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] },
  };
}

function resolveBore(opts, ctx, keys = ['OD', 'BORE']) {
  for (const key of keys) {
    if (opts[key] != null) return Number(opts[key]);
  }
  return Number(ctx.defaultOD || 168.3);
}

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

function formatDistance(a, b) {
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
}

function requireArgs(args, count, usage) {
  if (args.length < count) throw new Error(`Usage: ${usage}`);
}

export function registerBuiltinCommands() {

  register('POLYLINE', (args, ctx) => {
    // POLYLINE x1,y1,z1 x2,y2,z2 ... OR POLYLINE followed by matrix
    let points = [];
    if (args.length > 0) {
      points = args.map(arg => parseXYZ(arg, ctx));
    } else if (ctx.matrix) {
      const v = validateMatrixInput(ctx.matrix);
      if (!v.ok) throw new Error('Invalid matrix input for POLYLINE: ' + JSON.stringify(v.errors));
      points = v.points;
    } else {
      throw new Error('POLYLINE requires point arguments or matrix input');
    }

    if (points.length < 2) throw new Error('POLYLINE requires at least two valid points');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const opts = parseKV(args);
    const spec = { pipelineRef: opts.PIPELINE || ctx.pipeline || '' };

    const routeId = routeEngine.createPolyline(points, spec, { source: 'macro-polyline' });
    const route = routeEngine.getRoutes().find(r => r.id === routeId);
    if (!route) throw new Error('Failed to create POLYLINE route');

    const createdComps = (route.segments || []).map(seg => ({ id: seg.id, type: 'PIPE' }));
    return registerCompsResult(createdComps, ctx, `POLYLINE created route ${routeId} with ${route.segments.length} segments`);
  });

  register('SPLINE_GUIDE', (args, ctx) => {
    let points = [];
    if (args.length > 0) {
      points = args.map(arg => parseXYZ(arg, ctx));
    } else if (ctx.matrix) {
      const v = validateMatrixInput(ctx.matrix);
      if (!v.ok) throw new Error('Invalid matrix input for SPLINE_GUIDE: ' + JSON.stringify(v.errors));
      points = v.points;
    } else {
      throw new Error('SPLINE_GUIDE requires point arguments or matrix input');
    }

    if (points.length < 2) throw new Error('SPLINE_GUIDE requires at least two valid points');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const id = routeEngine.createGuide(points, 'SPLINE', { source: 'macro-spline-guide' });
    return { message: `SPLINE_GUIDE created: ${id}` };
  });

  register('STRETCH', (args, ctx) => {
    requireArgs(args, 2, 'STRETCH nodeId dx,dy,dz');
    const nodeId = String(args[0]);
    const delta = parseXYZ(args[1], ctx, 'route-delta');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('STRETCH requires an active route selection');

    routeEngine.stretchNode(activeRouteId, nodeId, delta, { source: 'macro-stretch' });
    return { message: `STRETCH applied to node ${nodeId}` };
  });

  register('ROTATE', (args, ctx) => {
    requireArgs(args, 3, 'ROTATE nodeId1,nodeId2,... angle pivotX,pivotY,pivotZ [AXIS=Z]');
    const nodeIds = String(args[0]).split(',').map(s => s.trim()).filter(Boolean);
    const angle = Number(args[1]);
    if (!Number.isFinite(angle)) throw new Error('ROTATE angle must be numeric');
    const pivot = parseXYZ(args[2], ctx);
    const opts = parseKV(args.slice(3));
    const axis = String(opts.AXIS || 'Z').toUpperCase();

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('ROTATE requires an active route selection');

    routeEngine.rotateNodes(activeRouteId, pivot, angle, axis, nodeIds, { source: 'macro-rotate' });
    return { message: `ROTATE applied to nodes ${nodeIds.join(', ')} by ${angle} degrees` };
  });

  register('BREAK', (args, ctx) => {
    requireArgs(args, 1, 'BREAK segmentId [x,y,z]');
    const segmentId = String(args[0]);
    let point = null;
    if (args[1]) {
      point = parseXYZ(args[1], ctx);
    }

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('BREAK requires an active route selection');

    routeEngine.breakSegment(activeRouteId, segmentId, point, { source: 'macro-break' });
    return { message: `BREAK applied to segment ${segmentId}` };
  });

  register('DELETE', (args, ctx) => {
    requireArgs(args, 1, 'DELETE segmentId|nodeId|routeId');
    const id = String(args[0]);
    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('DELETE requires an active route selection (for segment/node delete)');

    const state = routeEngine.getState();
    const route = (state.model?.routes || []).find(r => r.id === activeRouteId);

    let isSegment = route?.segments?.some(s => s.id === id);
    let isNode = route?.nodes?.some(n => n.id === id);

    if (isSegment) {
       routeEngine.execute({ type: 'ROUTE_DELETE', payload: { routeId: activeRouteId, segmentId: id }, meta: { source: 'macro-delete' }});
       return { message: `DELETE applied to segment ${id}` };
    } else if (isNode) {
       routeEngine.execute({ type: 'ROUTE_DELETE', payload: { routeId: activeRouteId, nodeId: id }, meta: { source: 'macro-delete' }});
       return { message: `DELETE applied to node ${id}` };
    } else {
       routeEngine.execute({ type: 'ROUTE_DELETE', payload: { routeId: id }, meta: { source: 'macro-delete' }});
       return { message: `DELETE applied to route ${id}` };
    }
  });

  register('MOVE', (args, ctx) => {
    requireArgs(args, 2, 'MOVE nodeId dx,dy,dz');
    const nodeId = String(args[0]);
    const delta = parseXYZ(args[1], ctx, 'route-delta');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('MOVE requires an active route selection');

    routeEngine.moveNode(activeRouteId, nodeId, delta, { source: 'macro-move' });
    return { message: `MOVE applied to node ${nodeId}` };
  });

  if (_commands.size) return;

  register('PIPE', (args, ctx) => {
    requireArgs(args, 2, 'PIPE x1,y1,z1 x2,y2,z2 [OD=n] [MAT=CS]');
    const ep1 = parseXYZ(args[0], ctx);
    const ep2 = parseXYZ(args[1], ctx);
    const opts = parseKV(args.slice(2));
    const bore = resolveBore(opts, ctx);
    const comp = componentBase('PIPE', ctx, `PIPE ${bore}mm`);
    comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: null, bore, size: null };
    comp.attributes = {
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
      'BORE': String(bore),
    };
    return registerCompResult(comp, ctx, `PIPE created: ${comp.id} (${formatDistance(ep1, ep2)}mm, OD=${bore})`);
  });

  register('ELBOW', (args, ctx) => {
    requireArgs(args, 3, 'ELBOW x1,y1,z1 xc,yc,zc x2,y2,z2 [OD=n] [R=long/short]');
    const ep1 = parseXYZ(args[0], ctx);
    const cp = parseXYZ(args[1], ctx);
    const ep2 = parseXYZ(args[2], ctx);
    const opts = parseKV(args.slice(3));
    const bore = resolveBore(opts, ctx);
    const comp = componentBase('ELBOW', ctx, `ELBOW ${bore}mm`);
    comp.geometry = { origin: cp, ep1, ep2, cp, bp: null, bore, size: null };
    comp.attributes = {
      'BORE': String(bore),
      'RADIUS-TYPE': String(opts.R || 'LONG').toUpperCase(),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `ELBOW created: ${comp.id}`);
  });

  register('TEE', (args, ctx) => {
    requireArgs(args, 3, 'TEE x1,y1,z1 x2,y2,z2 xb,yb,zb [OD=n] [BRANCH-OD=n]');
    const ep1 = parseXYZ(args[0], ctx);
    const ep2 = parseXYZ(args[1], ctx);
    const bp = parseXYZ(args[2], ctx);
    const opts = parseKV(args.slice(3));
    const bore = resolveBore(opts, ctx);
    const branchBore = Number(opts['BRANCH-OD'] || opts.BRANCH_OD || bore);
    const comp = componentBase('TEE', ctx, `TEE ${bore}/${branchBore}`);
    comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: { ...bp, bore: branchBore }, bore, size: null };
    comp.attributes = {
      'BORE': String(bore),
      'BRANCH-BORE': String(branchBore),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `TEE created: ${comp.id}`);
  });

  register('FLANGE', (args, ctx) => {
    requireArgs(args, 1, 'FLANGE x,y,z [OD=n] [RATING=150]');
    const origin = parseXYZ(args[0], ctx);
    const opts = parseKV(args.slice(1));
    const bore = resolveBore(opts, ctx);
    const comp = componentBase('FLANGE', ctx, `FLANGE ${bore}mm`);
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore, size: null };
    comp.attributes = {
      'BORE': String(bore),
      'RATING': String(opts.RATING || '150'),
      'TYPE': String(opts.TYPE || 'WN').toUpperCase(),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `FLANGE created: ${comp.id} (RATING=${comp.attributes.RATING})`);
  });

  register('VALVE', (args, ctx) => {
    requireArgs(args, 1, 'VALVE x,y,z [OD=n] [TYPE=GATE/BALL/CHECK]');
    const origin = parseXYZ(args[0], ctx);
    const opts = parseKV(args.slice(1));
    const bore = resolveBore(opts, ctx);
    const comp = componentBase('VALVE', ctx, `VALVE ${bore}mm`);
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore, size: null };
    comp.attributes = {
      'BORE': String(bore),
      'VALVE-TYPE': String(opts.TYPE || 'GATE').toUpperCase(),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `VALVE created: ${comp.id} (${comp.attributes['VALVE-TYPE']})`);
  });

  register('REDUCER', (args, ctx) => {
    requireArgs(args, 2, 'REDUCER x1,y1,z1 x2,y2,z2 [OD1=n] [OD2=n]');
    const ep1 = parseXYZ(args[0], ctx);
    const ep2 = parseXYZ(args[1], ctx);
    const opts = parseKV(args.slice(2));
    const od1 = Number(opts.OD1 || ctx.defaultOD || 168.3);
    const od2 = Number(opts.OD2 || opts.OD || od1 / 2);
    const comp = componentBase('REDUCER', ctx, `REDUCER ${od1}/${od2}`);
    comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: null, bore: od1, size: null };
    comp.attributes = {
      'OD1': String(od1),
      'OD2': String(od2),
      'TYPE': String(opts.TYPE || 'CONCENTRIC').toUpperCase(),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `REDUCER created: ${comp.id} (${od1}→${od2})`);
  });

  register('SUPPORT', (args, ctx) => {
    requireArgs(args, 1, 'SUPPORT x,y,z [KIND=REST/GUIDE/ANCHOR] [NAME=S-01]');
    const origin = parseXYZ(args[0], ctx);
    const opts = parseKV(args.slice(1));
    const kind = String(opts.KIND || 'REST').toUpperCase();
    const name = String(opts.NAME || '');
    const comp = componentBase('SUPPORT', ctx, name || `SUPPORT ${kind}`);
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore: null, size: null };
    comp.attributes = {
      'SUPPORT-TYPE': kind,
      'SUPPORT-KIND': kind,
      'SUPPORT-NAME': name,
      '<SUPPORT_NAME>': name,
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
    };
    return registerCompResult(comp, ctx, `SUPPORT created: ${comp.id} (${kind})`);
  });

  register('LABEL', (args, ctx) => {
    requireArgs(args, 2, 'LABEL x,y,z "text"');
    const origin = parseXYZ(args[0], ctx);
    const text = args.slice(1).join(' ').trim();
    const comp = componentBase('MESSAGE-SQUARE', ctx, text || 'LABEL');
    comp.geometry = { origin, ep1: null, ep2: null, cp: null, bp: null, bore: null, size: null };
    comp.metadata.squareText = text;
    comp.metadata.squarePos = origin;
    return registerCompResult(comp, ctx, `LABEL created: ${comp.id}`);
  });

  register('ORIGIN', (args, ctx) => {
    requireArgs(args, 1, 'ORIGIN x,y,z');
    const origin = parseXYZ(args[0], { ...ctx, lastPoint: { x: 0, y: 0, z: 0 }, workingOrigin: { x: 0, y: 0, z: 0 } });
    ctx.workingOrigin = origin;
    ctx.lastPoint = origin;
    return { message: `Working Plane Origin set to ${origin.x},${origin.y},${origin.z}` };
  });

  register('ALIGN', (args, ctx) => {
    requireArgs(args, 1, 'ALIGN NORTH/EAST/UP');
    ctx.workingAlignment = String(args[0]).toUpperCase();
    return { message: `Working Plane aligned to ${ctx.workingAlignment}` };
  });

  register('ARRAY', (args, ctx) => {
    requireArgs(args, 3, 'ARRAY LAST n dx,dy,dz');
    if (String(args[0]).toUpperCase() !== 'LAST') throw new Error('ARRAY currently supports only LAST');
    const count = Number(args[1]);
    if (!Number.isFinite(count) || count < 1) throw new Error('ARRAY count must be >= 1');
    const delta = parseXYZ(args[2], ctx, 'route-delta');
    const base = ctx.lastEntities || [];
    if (!base.length) throw new Error('No LAST entity available for ARRAY');
    const comps = [];
    for (let i = 1; i <= count; i++) {
      const offset = { x: delta.x * i, y: delta.y * i, z: delta.z * i };
      base.forEach(comp => comps.push(withOffset(comp, offset, ctx)));
    }
    return registerCompsResult(comps, ctx, `ARRAY created: ${comps.length} copied component(s)`);
  });

  register('MIRROR', (args, ctx) => {
    requireArgs(args, 2, 'MIRROR LAST PLANE=XY/XZ/YZ');
    if (String(args[0]).toUpperCase() !== 'LAST') throw new Error('MIRROR currently supports only LAST');
    const opts = parseKV(args.slice(1));
    const plane = String(opts.PLANE || '').toUpperCase();
    if (!['XY', 'XZ', 'YZ'].includes(plane)) throw new Error('MIRROR requires PLANE=XY/XZ/YZ');
    const base = ctx.lastEntities || [];
    if (!base.length) throw new Error('No LAST entity available for MIRROR');
    const comps = base.map(comp => withMirror(comp, plane, ctx));
    return registerCompsResult(comps, ctx, `MIRROR created: ${comps.length} mirrored component(s)`);
  });

  register('ROUTE', (args, ctx) => {
    const opts = parseKV(args);
    beginRoute(ctx, opts);
    return { message: `ROUTE mode started${opts.PIPELINE ? ` (${opts.PIPELINE})` : ''}` };
  });

  register('START', (args, ctx) => {
    requireArgs(args, 1, 'START x,y,z');
    const pt = parseXYZ(args[0], ctx);
    routeStart(ctx, pt);
    return { message: `ROUTE start set at ${pt.x},${pt.y},${pt.z}` };
  });

  register('RUN', (args, ctx) => {
    requireArgs(args, 1, 'RUN dx,dy,dz');
    requireActiveRoute(ctx);
    const delta = parseXYZ(args[0], ctx, 'route-delta');
    const opts = parseKV(args.slice(1));
    const bore = resolveBore(opts, ctx);
    const pending = consumePendingElbow(ctx, delta, opts.R || opts.RADIUS || bore * 1.5);
    const comps = [];
    if (pending) {
      const elbow = componentBase('ELBOW', ctx, `ELBOW ${bore}mm`);
      elbow.geometry = { origin: pending.cp, ep1: pending.ep1, ep2: pending.ep2, cp: pending.cp, bp: null, bore, size: null };
      elbow.attributes = {
        'BORE': String(bore),
        'RADIUS-TYPE': String(opts.R || 'LONG').toUpperCase(),
        'PIPELINE-REFERENCE': ctx.pipeline || '',
        'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
        'ROUTE-ELBOW-DIRECTION': pending.direction,
      };
      comps.push(elbow);
    }
    const run = routeRunDelta(ctx, delta);
    const pipe = componentBase('PIPE', ctx, `PIPE ${bore}mm`);
    pipe.geometry = { origin: run.start, ep1: run.start, ep2: run.end, cp: null, bp: null, bore, size: null };
    pipe.attributes = {
      'PIPELINE-REFERENCE': ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
      'BORE': String(bore),
    };
    comps.push(pipe);
    ctx.routeState.createdIds.push(...comps.map(c => c.id));
    return registerCompsResult(comps, ctx, `RUN created: ${pipe.id} (${formatDistance(run.start, run.end)}mm)`);
  });

  register('ELBOW', (args, ctx) => {
    if (ctx.routeState?.active && args.length >= 2 && /^\d+$/.test(String(args[0]))) {
      const queued = routeQueueElbow(ctx, args[0], args[1]);
      return { message: `ROUTE elbow queued: ${queued.angle}° ${queued.dirToken}` };
    }
    // Outside route mode, the geometric ELBOW command remains available via earlier registration.
    return _commands.get('ELBOW')?.__direct(args, ctx);
  });
  // keep direct elbow handler reachable
  _commands.get('ELBOW').__direct = (args, ctx) => {
    requireArgs(args, 3, 'ELBOW x1,y1,z1 xc,yc,zc x2,y2,z2 [OD=n] [R=long/short]');
    const ep1 = parseXYZ(args[0], ctx);
    const cp = parseXYZ(args[1], ctx);
    const ep2 = parseXYZ(args[2], ctx);
    const opts = parseKV(args.slice(3));
    const bore = resolveBore(opts, ctx);
    const comp = componentBase('ELBOW', ctx, `ELBOW ${bore}mm`);
    comp.geometry = { origin: cp, ep1, ep2, cp, bp: null, bore, size: null };
    comp.attributes = {
      'BORE': String(bore),
      'RADIUS-TYPE': String(opts.R || 'LONG').toUpperCase(),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `ELBOW created: ${comp.id}`);
  };

  register('TEE', (args, ctx) => {
    if (ctx.routeState?.active && args[0] && args[0].toUpperCase().startsWith('BRANCH-OD')) {
      const opts = parseKV(args);
      const rs = requireActiveRoute(ctx);
      if (!rs.lastPoint) throw new Error('TEE in ROUTE mode requires an active last point');
      const branchDelta = parseXYZ(String(opts.BRANCH || '0,1000,0'), ctx, 'route-delta');
      const bp = { x: rs.lastPoint.x + branchDelta.x, y: rs.lastPoint.y + branchDelta.y, z: rs.lastPoint.z + branchDelta.z };
      const bore = Number(opts.OD || ctx.defaultOD || 168.3);
      const branchBore = Number(opts['BRANCH-OD'] || opts.BRANCH_OD || bore);
      const comp = componentBase('TEE', ctx, `TEE ${bore}/${branchBore}`);
      comp.geometry = { origin: rs.lastPoint, ep1: rs.lastPoint, ep2: rs.lastPoint, cp: null, bp: { ...bp, bore: branchBore }, bore, size: null };
      comp.attributes = {
        'BORE': String(bore),
        'BRANCH-BORE': String(branchBore),
        'PIPELINE-REFERENCE': ctx.pipeline || '',
        'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
      };
      ctx.routeState.createdIds.push(comp.id);
      return registerCompResult(comp, ctx, `ROUTE tee created: ${comp.id}`);
    }
    return _commands.get('TEE').__direct(args, ctx);
  });
  _commands.get('TEE').__direct = (args, ctx) => {
    requireArgs(args, 3, 'TEE x1,y1,z1 x2,y2,z2 xb,yb,zb [OD=n] [BRANCH-OD=n]');
    const ep1 = parseXYZ(args[0], ctx);
    const ep2 = parseXYZ(args[1], ctx);
    const bp = parseXYZ(args[2], ctx);
    const opts = parseKV(args.slice(3));
    const bore = resolveBore(opts, ctx);
    const branchBore = Number(opts['BRANCH-OD'] || opts.BRANCH_OD || bore);
    const comp = componentBase('TEE', ctx, `TEE ${bore}/${branchBore}`);
    comp.geometry = { origin: ep1, ep1, ep2, cp: null, bp: { ...bp, bore: branchBore }, bore, size: null };
    comp.attributes = {
      'BORE': String(bore),
      'BRANCH-BORE': String(branchBore),
      'PIPELINE-REFERENCE': opts.PIPELINE || ctx.pipeline || '',
      'MATERIAL': opts.MAT || ctx.defaultMat || 'CS',
    };
    return registerCompResult(comp, ctx, `TEE created: ${comp.id}`);
  };

  register('END', (_args, ctx) => {
    const summary = routeEnd(ctx);
    return { message: `ROUTE ended: ${summary.count} component(s) from route state` };
  });

  register('LIST', (args, ctx) => {
    const wanted = args[0] ? String(args[0]).toUpperCase() : null;
    const comps = (ctx.getComponents?.() || []).filter(comp => !wanted || String(comp.type).toUpperCase() === wanted);
    const lines = comps.map(comp => `${comp.id}  ${comp.type}  ${comp.label || ''}`);
    return { message: `${wanted || 'ALL'} count: ${comps.length}`, lines };
  });

  register('DIST', (args, ctx) => {
    requireArgs(args, 2, 'DIST x1,y1,z1 x2,y2,z2');
    const a = parseXYZ(args[0], ctx);
    const b = parseXYZ(args[1], ctx);
    return { message: `Distance: ${formatDistance(a, b)} mm` };
  });

  register('INSPECT', (args, ctx) => {
    requireArgs(args, 1, 'INSPECT id');
    const id = String(args[0]);
    const comp = (ctx.getComponents?.() || []).find(c => c.id === id);
    if (!comp) throw new Error(`No component found with id: ${id}`);
    return {
      message: `${comp.id} ${comp.type}`,
      lines: [
        `label=${comp.label || ''}`,
        `origin=${JSON.stringify(comp.geometry?.origin || null)}`,
        `attrs=${JSON.stringify(comp.attributes || {})}`,
      ],
    };
  });

  register('VALIDATE', (_args, ctx) => {
    const results = ctx.getDomain?.()?.validate?.(ctx.getComponents?.() || []) || [];
    const lines = results.map(r => `${String(r.severity || 'info').toUpperCase()} ${r.code}: ${r.message}${r.compId ? ` [${r.compId}]` : ''}`);
    return { message: `Validation results: ${results.length}`, lines };
  });
}
