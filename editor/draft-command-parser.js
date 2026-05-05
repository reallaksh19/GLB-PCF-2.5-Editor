/**
 * editor/draft-command-parser.js
 * Shared precision token parser for HUD + Macro + future command palette.
 */

import { addPoint3, clonePoint3, distancePoint3, toPoint3 } from '../core/geometry/point3.js';

export const DRAFT_COMMAND_PARSER_VERSION = 'M4-DRAFT-PARSER-1.0.0';

function parseNumberStrict(token, label) {
  const value = Number(token);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${token}`);
  return value;
}

function normalizeAxisLock(axisLock) {
  const value = String(axisLock || '').trim().toUpperCase();
  if (value === 'X' || value === 'Y' || value === 'Z') return value;
  return 'X';
}

function buildResult(commandText, mode, fromPoint, toPoint, delta, axisLock, angleDeg, diagnostics) {
  return {
    ok: true,
    mode,
    fromPoint: clonePoint3(fromPoint),
    toPoint: clonePoint3(toPoint),
    delta: clonePoint3(delta),
    lengthMm: distancePoint3(fromPoint, toPoint),
    axisLock: axisLock || null,
    angleDeg: Number.isFinite(Number(angleDeg)) ? Number(angleDeg) : null,
    commandText,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
    parserVersion: DRAFT_COMMAND_PARSER_VERSION,
  };
}

function axisDelta(axis, value) {
  if (axis === 'X') return { x: value, y: 0, z: 0 };
  if (axis === 'Y') return { x: 0, y: value, z: 0 };
  return { x: 0, y: 0, z: value };
}

function parseAxisToken(commandText, fromPoint, token) {
  const match = token.match(/^([XYZRD])([+-]?\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const key = String(match[1]).toUpperCase();
  const numericValue = parseNumberStrict(match[2], 'axis value');
  let axis = key;
  let value = numericValue;
  if (key === 'R') {
    axis = 'Z';
    value = Math.abs(numericValue);
  } else if (key === 'D') {
    axis = 'Z';
    value = -Math.abs(numericValue);
  }
  const delta = axisDelta(axis, value);
  const toPoint = addPoint3(fromPoint, delta);
  return buildResult(commandText, 'axis', fromPoint, toPoint, delta, axis, null, []);
}

function parseRelativeVector(commandText, fromPoint, token) {
  const match = token.match(/^@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const delta = {
    x: parseNumberStrict(match[1], 'relative x'),
    y: parseNumberStrict(match[2], 'relative y'),
    z: parseNumberStrict(match[3], 'relative z'),
  };
  const toPoint = addPoint3(fromPoint, delta);
  return buildResult(commandText, 'relative', fromPoint, toPoint, delta, null, null, []);
}

function parseAbsoluteVector(commandText, fromPoint, token) {
  const match = token.match(/^([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const toPoint = {
    x: parseNumberStrict(match[1], 'absolute x'),
    y: parseNumberStrict(match[2], 'absolute y'),
    z: parseNumberStrict(match[3], 'absolute z'),
  };
  const delta = {
    x: toPoint.x - fromPoint.x,
    y: toPoint.y - fromPoint.y,
    z: toPoint.z - fromPoint.z,
  };
  return buildResult(commandText, 'absolute', fromPoint, toPoint, delta, null, null, []);
}

function parseRelativeBearing(commandText, fromPoint, token) {
  const match = token.match(/^@([+-]?\d+(?:\.\d+)?)<([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const length = parseNumberStrict(match[1], 'bearing length');
  const angleDeg = parseNumberStrict(match[2], 'bearing angle');
  const angleRad = angleDeg * (Math.PI / 180);
  const delta = {
    x: length * Math.cos(angleRad),
    y: length * Math.sin(angleRad),
    z: 0,
  };
  const toPoint = addPoint3(fromPoint, delta);
  return buildResult(commandText, 'bearing', fromPoint, toPoint, delta, null, angleDeg, []);
}

function parseScalarLength(commandText, fromPoint, token, axisLock) {
  const match = token.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const length = parseNumberStrict(match[1], 'length');
  const axis = normalizeAxisLock(axisLock);
  const diagnostics = [];
  if (!axisLock) diagnostics.push('AXIS_LOCK_DEFAULTED_TO_X');
  const delta = axisDelta(axis, length);
  const toPoint = addPoint3(fromPoint, delta);
  return buildResult(commandText, 'length', fromPoint, toPoint, delta, axis, null, diagnostics);
}

/**
 * Parse one precision drafting token against a start point.
 */
export function parseDraftCommand(commandText, fromPoint, options) {
  const sourcePoint = toPoint3(fromPoint);
  const sourceText = String(commandText || '').trim();
  const token = sourceText.toUpperCase();
  const opts = options && typeof options === 'object' ? options : {};

  if (!sourceText) {
    return {
      ok: false,
      mode: null,
      fromPoint: clonePoint3(sourcePoint),
      toPoint: null,
      delta: null,
      lengthMm: null,
      axisLock: null,
      angleDeg: null,
      commandText: sourceText,
      diagnostics: ['EMPTY_COMMAND'],
      parserVersion: DRAFT_COMMAND_PARSER_VERSION,
    };
  }

  const parsedBearing = parseRelativeBearing(sourceText, sourcePoint, token);
  if (parsedBearing) return parsedBearing;

  const parsedRelative = parseRelativeVector(sourceText, sourcePoint, token);
  if (parsedRelative) return parsedRelative;

  const parsedAbsolute = parseAbsoluteVector(sourceText, sourcePoint, token);
  if (parsedAbsolute) return parsedAbsolute;

  const parsedAxis = parseAxisToken(sourceText, sourcePoint, token);
  if (parsedAxis) return parsedAxis;

  const parsedLength = parseScalarLength(sourceText, sourcePoint, token, opts.axisLock);
  if (parsedLength) return parsedLength;

  return {
    ok: false,
    mode: null,
    fromPoint: clonePoint3(sourcePoint),
    toPoint: null,
    delta: null,
    lengthMm: null,
    axisLock: null,
    angleDeg: null,
    commandText: sourceText,
    diagnostics: ['UNSUPPORTED_COMMAND_TOKEN'],
    parserVersion: DRAFT_COMMAND_PARSER_VERSION,
  };
}

export function parseDraftCommandOrThrow(commandText, fromPoint, options) {
  const parsed = parseDraftCommand(commandText, fromPoint, options);
  if (!parsed.ok) {
    const reason = parsed.diagnostics?.join(', ') || 'Invalid token';
    throw new Error(`Draft command parse failed: ${reason} (${commandText})`);
  }
  return parsed;
}
