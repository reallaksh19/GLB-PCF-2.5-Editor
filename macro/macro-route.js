function toPt(base, delta) {
  return { x: base.x + delta.x, y: base.y + delta.y, z: base.z + delta.z };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function axisFromDirectionToken(token) {
  const t = String(token || '').toUpperCase();
  switch (t) {
    case 'EAST': return { x: 1, y: 0, z: 0 };
    case 'WEST': return { x: -1, y: 0, z: 0 };
    case 'NORTH': return { x: 0, y: 1, z: 0 };
    case 'SOUTH': return { x: 0, y: -1, z: 0 };
    case 'UP': return { x: 0, y: 0, z: 1 };
    case 'DOWN': return { x: 0, y: 0, z: -1 };
    default: return null;
  }
}

export function beginRoute(ctx, opts = {}) {
  ctx.routeState = {
    active: true,
    opts,
    start: null,
    lastPoint: null,
    prevDir: null,
    pendingElbow: null,
    createdIds: [],
  };
  if (opts.OD && !ctx.defaultOD) ctx.defaultOD = Number(opts.OD);
  if (opts.MAT && !ctx.defaultMat) ctx.defaultMat = String(opts.MAT);
  if (opts.PIPELINE) ctx.pipeline = String(opts.PIPELINE);
  return ctx.routeState;
}

export function requireActiveRoute(ctx) {
  if (!ctx.routeState?.active) throw new Error('ROUTE mode is not active');
  return ctx.routeState;
}

export function routeStart(ctx, pt) {
  const rs = requireActiveRoute(ctx);
  rs.start = pt;
  rs.lastPoint = pt;
  ctx.lastPoint = pt;
  return pt;
}

export function routeRunDelta(ctx, delta) {
  const rs = requireActiveRoute(ctx);
  if (!rs.lastPoint) throw new Error('ROUTE START must be issued before RUN');
  const start = rs.lastPoint;
  const end = toPt(start, delta);
  const dir = normalize({ x: end.x - start.x, y: end.y - start.y, z: end.z - start.z });
  rs.lastPoint = end;
  ctx.lastPoint = end;
  rs.prevDir = dir;
  return { start, end, dir };
}

export function routeQueueElbow(ctx, angleToken, dirToken) {
  const rs = requireActiveRoute(ctx);
  rs.pendingElbow = {
    angle: Number(angleToken || 90),
    dirToken: String(dirToken || '').toUpperCase(),
  };
  return rs.pendingElbow;
}

export function consumePendingElbow(ctx, nextDelta, radiusMm) {
  const rs = requireActiveRoute(ctx);
  if (!rs.pendingElbow) return null;
  if (!rs.lastPoint || !rs.prevDir) throw new Error('ELBOW requires an existing route direction');

  const expectedDir = axisFromDirectionToken(rs.pendingElbow.dirToken);
  const nextDirRaw = normalize(nextDelta);
  const nextDir = expectedDir || nextDirRaw;
  const r = Math.max(Number(radiusMm) || 200, 50);
  const centre = rs.lastPoint;
  const ep1 = {
    x: centre.x - rs.prevDir.x * r,
    y: centre.y - rs.prevDir.y * r,
    z: centre.z - rs.prevDir.z * r,
  };
  const ep2 = {
    x: centre.x + nextDir.x * r,
    y: centre.y + nextDir.y * r,
    z: centre.z + nextDir.z * r,
  };

  const elbow = {
    ep1,
    cp: { ...centre },
    ep2,
    angle: rs.pendingElbow.angle,
    direction: rs.pendingElbow.dirToken,
  };

  rs.pendingElbow = null;
  return elbow;
}

export function routeEnd(ctx) {
  const rs = requireActiveRoute(ctx);
  const summary = {
    count: rs.createdIds.length,
    start: rs.start,
    end: rs.lastPoint,
    pipeline: rs.opts.PIPELINE || ctx.pipeline || '',
  };
  ctx.routeState = null;
  return summary;
}
