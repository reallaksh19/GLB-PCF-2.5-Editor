import {
  parseDraftCommandOrThrow,
  parseDraftTokensOrThrow,
} from '../editor/draft-command-parser.js';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clonePoint(point) {
  return {
    x: finiteNumber(point?.x, 0),
    y: finiteNumber(point?.y, 0),
    z: finiteNumber(point?.z, 0),
  };
}

function parsePointParts(token) {
  const text = String(token || '').trim();
  const isRelative = text.startsWith('@');
  const raw = isRelative ? text.slice(1) : text;
  const parts = raw.split(',').map((v) => Number(v.trim()));

  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) {
    throw new Error(`Invalid coordinate: ${token}`);
  }

  return {
    isRelative,
    delta: {
      x: parts[0],
      y: parts[1],
      z: parts[2],
    },
  };
}

export function parseMacroKv(tokens = []) {
  const opts = {};
  const values = [];

  for (const token of tokens || []) {
    const text = String(token || '');
    const idx = text.indexOf('=');

    if (idx > 0) {
      const key = text.slice(0, idx).trim().toUpperCase();
      const value = text.slice(idx + 1).trim();
      opts[key] = value;
    } else {
      values.push(text);
    }
  }

  return { opts, values };
}

/**
 * Legacy macro coordinate argument parser.
 *
 * Non-relative coordinates preserve old macro behavior:
 *   coordinate + workingOrigin
 *
 * Relative coordinates use:
 *   coordinate + lastPoint
 */
export function parseMacroPointToken(token, ctx = {}) {
  if (!token) throw new Error('Missing coordinate token');

  const parsed = parsePointParts(token);

  const base = parsed.isRelative
    ? clonePoint(ctx.lastPoint || { x: 0, y: 0, z: 0 })
    : clonePoint(ctx.workingOrigin || { x: 0, y: 0, z: 0 });

  return {
    x: base.x + parsed.delta.x,
    y: base.y + parsed.delta.y,
    z: base.z + parsed.delta.z,
  };
}

/**
 * START= parser for precision drafting commands.
 *
 * START=x,y,z is explicit model-space and must not be offset by workingOrigin.
 * START=@dx,dy,dz is relative to lastPoint, otherwise workingOrigin, otherwise origin.
 */
export function parseMacroStartPointToken(token, ctx = {}) {
  if (!token) throw new Error('Missing START coordinate token');

  const parsed = parsePointParts(token);

  if (!parsed.isRelative) {
    return clonePoint(parsed.delta);
  }

  const base = clonePoint(
    ctx.lastPoint ||
    ctx.workingOrigin ||
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: base.x + parsed.delta.x,
    y: base.y + parsed.delta.y,
    z: base.z + parsed.delta.z,
  };
}

export function looksLikeDraftToken(token) {
  const text = String(token || '').trim();
  return /^([XYZRD][+-]?\d|@[+-]?\d|[+-]?\d+(?:\.\d+)?$)/i.test(text);
}

export function resolveMacroStartPoint(opts = {}, ctx = {}) {
  if (opts.START) return parseMacroStartPointToken(opts.START, ctx);

  if (ctx.lastPoint) return clonePoint(ctx.lastPoint);
  if (ctx.workingOrigin) return clonePoint(ctx.workingOrigin);

  return { x: 0, y: 0, z: 0 };
}

export function resolveMacroDraftSequence(tokens = [], ctx = {}, options = {}) {
  const { opts, values } = parseMacroKv(tokens);
  const startPoint = options.startPoint || resolveMacroStartPoint(opts, ctx);
  const axisLock = String(opts.AXIS || options.axisLock || 'X').toUpperCase();

  if (!values.length) {
    throw new Error(`${options.commandName || 'Macro draft command'} requires one or more draft tokens`);
  }

  const parsed = parseDraftTokensOrThrow(values, startPoint, { axisLock });

  return {
    opts,
    valueTokens: values,
    startPoint: clonePoint(startPoint),
    points: parsed.points.map(clonePoint),
    segments: parsed.segments,
    axisLock,
  };
}

export function resolveMacroLine(tokens = [], ctx = {}) {
  const { opts, values } = parseMacroKv(tokens);

  if (values.length === 2 && !opts.START) {
    const ep1 = parseMacroPointToken(values[0], ctx);
    const ep2 = parseMacroPointToken(values[1], ctx);

    return {
      opts,
      startPoint: ep1,
      endPoint: ep2,
      points: [ep1, ep2],
      token: values[1],
      parsed: null,
      mode: 'absolute-pair',
    };
  }

  const startPoint = resolveMacroStartPoint(opts, ctx);
  const token = values[0];

  if (!token) {
    throw new Error('LINE requires either START=x,y,z token or two coordinate points');
  }

  const axisLock = String(opts.AXIS || 'X').toUpperCase();
  const parsed = parseDraftCommandOrThrow(token, startPoint, { axisLock });

  return {
    opts,
    startPoint: clonePoint(parsed.fromPoint),
    endPoint: clonePoint(parsed.toPoint),
    points: [clonePoint(parsed.fromPoint), clonePoint(parsed.toPoint)],
    token,
    parsed,
    mode: parsed.mode,
  };
}

export function routeEngineOrThrow(ctx = {}) {
  const routeEngine = ctx.getRouteEngine?.();

  if (!routeEngine) {
    throw new Error('ROUTE engine not initialized');
  }

  return routeEngine;
}

export function buildPipelineSpec(opts = {}, ctx = {}) {
  return withoutEmptyValues({
    pipelineRef: opts.PIPELINE || opts.PIPELINE_REF || ctx.pipeline || '',
    pipeline: opts.PIPELINE || ctx.pipeline || '',
    size: opts.SIZE || opts.NPS || opts.NOMINAL_SIZE,
    nominalSize: opts.NOMINAL_SIZE || opts.SIZE || opts.NPS,
    sch: opts.SCH || opts.SCHEDULE,
    schedule: opts.SCHEDULE || opts.SCH,
    rating: opts.RATING || opts.CLASS,
    class: opts.CLASS || opts.RATING,
    material: opts.MAT || opts.MATERIAL || ctx.defaultMat || '',
  });
}

export function summarizePoint(point) {
  const p = clonePoint(point);
  return `${p.x},${p.y},${p.z}`;
}

function withoutEmptyValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}
