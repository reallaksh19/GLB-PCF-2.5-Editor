/**
 * editor/route-segment-input.js
 * Shared helpers for line/polyline segment endpoint resolution.
 */

import { parseDraftCommandOrThrow } from './draft-command-parser.js';

function normalizeSign(sign) {
  return Number(sign) < 0 ? -1 : 1;
}

function normalizeAxis(axis) {
  const value = String(axis || '').trim().toUpperCase();
  if (value === 'X' || value === 'Y' || value === 'Z') return value;
  return 'X';
}

/**
 * Build a canonical axis token from UI axis + sign + length input.
 */
export function buildAxisLengthToken(axis, lengthMm, sign) {
  const resolvedAxis = normalizeAxis(axis);
  const magnitude = Math.abs(Number(lengthMm));
  if (!Number.isFinite(magnitude)) throw new Error('Length must be numeric');
  const value = magnitude * normalizeSign(sign);
  return `${resolvedAxis}${value}`;
}

/**
 * Parse and resolve one typed segment input against a start point.
 */
export function resolveRouteSegmentInput(fromPoint, commandText, axisLock) {
  return parseDraftCommandOrThrow(commandText, fromPoint, { axisLock });
}
