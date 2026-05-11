import { parseHudLineCommand } from './hud-line-command-parser.js';
import { buildAxisLengthToken } from '../editor/route-segment-input.js';

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

function normalizeAxis(axis) {
  const value = String(axis || 'X').trim().toUpperCase();
  if (value === 'X' || value === 'Y' || value === 'Z') return value;
  return 'X';
}

function normalizeSign(sign) {
  if (sign === '−') return -1;
  if (sign === '-') return -1;
  return Number(sign) < 0 ? -1 : 1;
}

function inferInputMode(parsed) {
  if (!parsed) return 'Length';

  switch (parsed.mode) {
    case 'relative':
      return 'Relative';
    case 'absolute':
      return 'Absolute';
    case 'bearing':
      return 'Bearing';
    case 'axis':
    case 'length':
    default:
      return 'Length';
  }
}

function inferAxisFromDelta(delta, fallback = 'X') {
  const d = delta || {};
  const ax = Math.abs(finiteNumber(d.x, 0));
  const ay = Math.abs(finiteNumber(d.y, 0));
  const az = Math.abs(finiteNumber(d.z, 0));

  if (az >= ax && az >= ay && az > 0) return 'Z';
  if (ay >= ax && ay >= az && ay > 0) return 'Y';
  if (ax > 0) return 'X';

  return normalizeAxis(fallback);
}

function inferSignFromAxis(delta, axis) {
  const d = delta || {};
  const value = axis === 'Z'
    ? finiteNumber(d.z, 0)
    : axis === 'Y'
      ? finiteNumber(d.y, 0)
      : finiteNumber(d.x, 0);

  return value < 0 ? -1 : 1;
}

function deltaFromDraft(draft = {}) {
  return {
    x: finiteNumber(draft.dx, 0),
    y: finiteNumber(draft.dy, 0),
    z: finiteNumber(draft.dz, 0),
  };
}

export function defaultLineDraftFields(draft = {}) {
  return {
    inputMode: draft.inputMode || 'Length',
    angleDeg: finiteNumber(draft.angleDeg, 0),
    dx: finiteNumber(draft.dx, 0),
    dy: finiteNumber(draft.dy, 0),
    dz: finiteNumber(draft.dz, 0),
  };
}

export function buildLineCommandFromDraft(draft = {}) {
  const mode = String(draft.inputMode || 'Length');
  const axis = normalizeAxis(draft.axis);
  const sign = normalizeSign(draft.sign);
  const lengthMm = Math.abs(finiteNumber(draft.lengthMm, 1000));

  if (mode === 'Relative') {
    const d = deltaFromDraft(draft);
    return `@${d.x},${d.y},${d.z}`;
  }

  if (mode === 'Absolute') {
    const anchor = clonePoint(draft.anchorPoint);
    const d = deltaFromDraft(draft);

    return [
      anchor.x + d.x,
      anchor.y + d.y,
      anchor.z + d.z,
    ].join(',');
  }

  if (mode === 'Bearing') {
    return `@${lengthMm}<${finiteNumber(draft.angleDeg, 0)}`;
  }

  return buildAxisLengthToken(axis, lengthMm, sign);
}

export function resolveLineDraftPreview(draft = {}) {
  const axis = normalizeAxis(draft.axis);
  const sign = normalizeSign(draft.sign);
  const anchorPoint = draft.anchorPoint ? clonePoint(draft.anchorPoint) : null;

  const base = {
    ...draft,
    ...defaultLineDraftFields(draft),
    axis,
    sign,
    lengthMm: Math.abs(finiteNumber(draft.lengthMm, 1000)),
    anchorPoint,
    errors: [],
  };

  if (!anchorPoint) {
    return {
      ...base,
      previewPoint: null,
      commandText: String(draft.commandText || '').trim(),
      lastParsed: null,
    };
  }

  const commandText = String(draft.commandText || '').trim()
    || buildLineCommandFromDraft(base);

  const parsed = parseHudLineCommand(commandText, anchorPoint, axis);
  const resolvedAxis = parsed.axisLock || inferAxisFromDelta(parsed.delta, axis);
  const resolvedSign = inferSignFromAxis(parsed.delta, resolvedAxis);

  return {
    ...base,
    axis: resolvedAxis,
    sign: resolvedSign,
    inputMode: inferInputMode(parsed),
    lengthMm: finiteNumber(parsed.lengthMm, base.lengthMm),
    angleDeg: parsed.angleDeg == null
      ? finiteNumber(base.angleDeg, 0)
      : finiteNumber(parsed.angleDeg, 0),
    dx: finiteNumber(parsed.delta?.x, 0),
    dy: finiteNumber(parsed.delta?.y, 0),
    dz: finiteNumber(parsed.delta?.z, 0),
    commandText,
    previewPoint: clonePoint(parsed.toPoint),
    lastParsed: parsed,
    errors: [],
  };
}

export function safeResolveLineDraftPreview(draft = {}) {
  try {
    return resolveLineDraftPreview(draft);
  } catch (err) {
    return {
      ...draft,
      ...defaultLineDraftFields(draft),
      errors: [String(err?.message || err)],
      lastParsed: null,
    };
  }
}

export function updateLineDraftField(draft = {}, field, value) {
  const next = {
    ...draft,
    ...defaultLineDraftFields(draft),
  };

  if (field === 'lengthMm') {
    next.lengthMm = Math.abs(finiteNumber(value, next.lengthMm || 1000));
    next.commandText = buildLineCommandFromDraft({
      ...next,
      inputMode: 'Length',
    });
  } else if (field === 'axis') {
    next.axis = normalizeAxis(value);
    next.inputMode = 'Length';
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'sign') {
    next.sign = normalizeSign(value);
    next.inputMode = 'Length';
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'inputMode') {
    next.inputMode = String(value || 'Length');
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'angleDeg') {
    next.angleDeg = finiteNumber(value, 0);
    next.inputMode = 'Bearing';
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'dx') {
    next.dx = finiteNumber(value, 0);
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'dy') {
    next.dy = finiteNumber(value, 0);
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'dz') {
    next.dz = finiteNumber(value, 0);
    next.commandText = buildLineCommandFromDraft(next);
  } else if (field === 'commandText') {
    next.commandText = String(value || '').trim();
  } else {
    next[field] = value;
  }

  return safeResolveLineDraftPreview(next);
}

export function buildRepeatLineDraft(currentDraft = {}, lastLengthMm = null) {
  const lengthMm = Math.abs(finiteNumber(lastLengthMm, finiteNumber(currentDraft.lengthMm, 1000)));

  const next = {
    ...currentDraft,
    inputMode: 'Length',
    lengthMm,
    commandText: buildAxisLengthToken(
      normalizeAxis(currentDraft.axis || 'X'),
      lengthMm,
      normalizeSign(currentDraft.sign)
    ),
  };

  return safeResolveLineDraftPreview(next);
}

export function lineDraftSummary(draft = {}) {
  const parsed = draft.lastParsed || null;

  return {
    inputMode: draft.inputMode || inferInputMode(parsed),
    commandText: String(draft.commandText || ''),
    axis: normalizeAxis(draft.axis),
    sign: normalizeSign(draft.sign),
    lengthMm: finiteNumber(draft.lengthMm, 0),
    anchorPoint: draft.anchorPoint ? clonePoint(draft.anchorPoint) : null,
    previewPoint: draft.previewPoint ? clonePoint(draft.previewPoint) : null,
    parsedMode: parsed?.mode || null,
    parserVersion: parsed?.parserVersion || null,
    errors: Array.isArray(draft.errors) ? [...draft.errors] : [],
  };
}
