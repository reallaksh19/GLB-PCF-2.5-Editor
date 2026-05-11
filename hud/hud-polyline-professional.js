import {
  parseDraftCommand,
  parseDraftTokensOrThrow,
} from '../editor/draft-command-parser.js';

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

function distance(a, b) {
  const dx = finiteNumber(b.x) - finiteNumber(a.x);
  const dy = finiteNumber(b.y) - finiteNumber(a.y);
  const dz = finiteNumber(b.z) - finiteNumber(a.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function formatPoint(point) {
  const p = clonePoint(point);
  return `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
}

function axisFromDelta(delta = {}, fallback = 'X') {
  const ax = Math.abs(finiteNumber(delta.x));
  const ay = Math.abs(finiteNumber(delta.y));
  const az = Math.abs(finiteNumber(delta.z));

  if (az >= ax && az >= ay && az > 0) return 'Z';
  if (ay >= ax && ay >= az && ay > 0) return 'Y';
  if (ax > 0) return 'X';

  return normalizeAxis(fallback);
}

function tokenFromStructuredDraft(draft = {}) {
  const mode = String(draft.inputMode || 'Length');
  const axis = normalizeAxis(draft.axis || draft.axisLock);
  const sign = normalizeSign(draft.sign);
  const len = Math.abs(finiteNumber(draft.lengthMm, 1000));

  if (mode === 'Relative') {
    return `@${finiteNumber(draft.dx)},${finiteNumber(draft.dy)},${finiteNumber(draft.dz)}`;
  }

  if (mode === 'Absolute') {
    const start = clonePoint(draft.currentPoint);
    return [
      start.x + finiteNumber(draft.dx),
      start.y + finiteNumber(draft.dy),
      start.z + finiteNumber(draft.dz),
    ].join(',');
  }

  if (mode === 'Bearing') {
    return `@${len}<${finiteNumber(draft.angleDeg, 0)}`;
  }

  return `${axis}${len * sign}`;
}

function segmentRowFromParsed(parsed, index) {
  return {
    index,
    from: clonePoint(parsed.fromPoint),
    to: clonePoint(parsed.toPoint),
    lengthMm: finiteNumber(parsed.lengthMm),
    angleDeg: parsed.angleDeg == null ? null : finiteNumber(parsed.angleDeg),
    axis: parsed.axisLock || axisFromDelta(parsed.delta),
    token: parsed.commandText,
    method: parsed.mode,
    delta: clonePoint(parsed.delta),
  };
}

export function createPolylineDraft(startPoint = null, options = {}) {
  const start = startPoint ? clonePoint(startPoint) : null;

  return {
    routeId: options.routeId || null,
    pipelineRef: options.pipelineRef || '',
    inputMode: options.inputMode || 'Length',
    axis: normalizeAxis(options.axis || 'X'),
    sign: normalizeSign(options.sign ?? 1),
    lengthMm: finiteNumber(options.lengthMm, 1000),
    angleDeg: finiteNumber(options.angleDeg, 0),
    dx: finiteNumber(options.dx, 0),
    dy: finiteNumber(options.dy, 0),
    dz: finiteNumber(options.dz, 0),
    commandText: String(options.commandText || ''),
    startPoint: start,
    currentPoint: start,
    points: start ? [start] : [],
    segments: [],
    previewPoint: null,
    previewSegment: null,
    errors: [],
  };
}

export function setPolylineStartPoint(draft = {}, point) {
  const start = clonePoint(point);

  return {
    ...draft,
    startPoint: start,
    currentPoint: start,
    points: [start],
    segments: [],
    previewPoint: null,
    previewSegment: null,
    errors: [],
  };
}

export function rebuildPolylineDraftFromTokens(startPoint, tokens, options = {}) {
  const parsed = parseDraftTokensOrThrow(tokens, clonePoint(startPoint), {
    axisLock: normalizeAxis(options.axis || options.axisLock || 'X'),
  });

  const segments = parsed.segments.map((seg, idx) => segmentRowFromParsed(seg, idx + 1));
  const points = parsed.points.map(clonePoint);
  const currentPoint = points[points.length - 1] || clonePoint(startPoint);

  return {
    ...createPolylineDraft(startPoint, options),
    points,
    segments,
    currentPoint,
    commandText: tokens[tokens.length - 1] || '',
    errors: [],
  };
}

export function resolvePolylineSegmentPreview(draft = {}) {
  const currentPoint = draft.currentPoint ? clonePoint(draft.currentPoint) : null;

  if (!currentPoint) {
    return {
      ...draft,
      previewPoint: null,
      previewSegment: null,
      errors: [],
    };
  }

  const axis = normalizeAxis(draft.axis || 'X');
  const token = String(draft.commandText || '').trim() || tokenFromStructuredDraft(draft);
  const parsed = parseDraftCommand(token, currentPoint, { axisLock: axis });

  if (!parsed.ok) {
    return {
      ...draft,
      previewPoint: null,
      previewSegment: null,
      errors: [`Polyline segment parse failed: ${(parsed.diagnostics || []).join(', ')}`],
    };
  }

  return {
    ...draft,
    commandText: token,
    previewPoint: clonePoint(parsed.toPoint),
    previewSegment: segmentRowFromParsed(parsed, (draft.segments || []).length + 1),
    errors: [],
  };
}

export function updatePolylineDraftField(draft = {}, field, value) {
  const next = {
    ...draft,
    axis: normalizeAxis(draft.axis || 'X'),
    sign: normalizeSign(draft.sign ?? 1),
    inputMode: draft.inputMode || 'Length',
    lengthMm: finiteNumber(draft.lengthMm, 1000),
    angleDeg: finiteNumber(draft.angleDeg, 0),
    dx: finiteNumber(draft.dx, 0),
    dy: finiteNumber(draft.dy, 0),
    dz: finiteNumber(draft.dz, 0),
  };

  if (field === 'axis') {
    next.axis = normalizeAxis(value);
    next.inputMode = 'Length';
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'sign') {
    next.sign = normalizeSign(value);
    next.inputMode = 'Length';
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'inputMode') {
    next.inputMode = String(value || 'Length');
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'lengthMm') {
    next.lengthMm = Math.abs(finiteNumber(value, 1000));
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'angleDeg') {
    next.angleDeg = finiteNumber(value, 0);
    next.inputMode = 'Bearing';
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'dx') {
    next.dx = finiteNumber(value, 0);
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'dy') {
    next.dy = finiteNumber(value, 0);
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'dz') {
    next.dz = finiteNumber(value, 0);
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'commandText') {
    next.commandText = String(value || '').trim();
  } else {
    next[field] = value;
  }

  return resolvePolylineSegmentPreview(next);
}

export function addPolylineSegment(draft = {}) {
  const resolved = resolvePolylineSegmentPreview(draft);

  if (resolved.errors?.length) return resolved;
  if (!resolved.previewSegment) {
    return {
      ...resolved,
      errors: ['Polyline requires a start point before adding a segment.'],
    };
  }

  const seg = resolved.previewSegment;
  const points = [...(draft.points || []), clonePoint(seg.to)];
  const segments = [...(draft.segments || []), seg];

  return {
    ...resolved,
    points,
    segments,
    currentPoint: clonePoint(seg.to),
    previewPoint: null,
    previewSegment: null,
    commandText: '',
    errors: [],
  };
}

export function addPolylineAbsolutePoint(draft = {}, point) {
  if (!draft.currentPoint || !(draft.points || []).length) {
    return setPolylineStartPoint(draft, point);
  }

  return addPolylineSegment({
    ...draft,
    commandText: `${finiteNumber(point.x)},${finiteNumber(point.y)},${finiteNumber(point.z)}`,
  });
}

export function setPolylinePreviewPoint(draft = {}, point) {
  if (!draft.currentPoint || !point) return draft;

  return resolvePolylineSegmentPreview({
    ...draft,
    commandText: `${finiteNumber(point.x)},${finiteNumber(point.y)},${finiteNumber(point.z)}`,
  });
}

export function undoPolylineSegment(draft = {}) {
  const segments = [...(draft.segments || [])];

  if (!segments.length) {
    const points = [...(draft.points || [])];
    if (points.length <= 1) {
      return {
        ...draft,
        startPoint: null,
        currentPoint: null,
        points: [],
        previewPoint: null,
        previewSegment: null,
        errors: [],
      };
    }

    return draft;
  }

  segments.pop();

  const points = [...(draft.points || [])];
  if (points.length > 1) points.pop();

  const currentPoint = points[points.length - 1] || null;

  return {
    ...draft,
    points,
    segments,
    currentPoint,
    startPoint: points[0] || null,
    previewPoint: null,
    previewSegment: null,
    errors: [],
  };
}

export function closePolylineDraft(draft = {}) {
  const points = draft.points || [];

  if (points.length < 3) {
    return {
      ...draft,
      errors: ['Polyline requires at least 3 points before Close.'],
    };
  }

  const start = points[0];
  const current = points[points.length - 1];

  if (distance(start, current) < 1e-9) return draft;

  return addPolylineSegment({
    ...draft,
    commandText: `${start.x},${start.y},${start.z}`,
  });
}

export function finishPolylineDraftPayload(draft = {}) {
  const points = (draft.points || []).map(clonePoint);

  if (points.length < 2) {
    return {
      ok: false,
      errors: ['Polyline requires at least 2 points before Finish.'],
      points,
      segments: draft.segments || [],
    };
  }

  return {
    ok: true,
    errors: [],
    routeId: draft.routeId || null,
    pipelineRef: draft.pipelineRef || '',
    points,
    segments: draft.segments || [],
  };
}

export function polylineSegmentTableRows(draft = {}) {
  return (draft.segments || []).map((seg) => ({
    index: seg.index,
    from: formatPoint(seg.from),
    to: formatPoint(seg.to),
    length: finiteNumber(seg.lengthMm).toFixed(1),
    angle: seg.angleDeg == null ? '—' : finiteNumber(seg.angleDeg).toFixed(1),
    axis: seg.axis || '—',
    token: seg.token || '',
    method: seg.method || '',
  }));
}
