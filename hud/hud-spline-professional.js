import { parseDraftCommand } from '../editor/draft-command-parser.js';

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

function formatPoint(point) {
  const p = clonePoint(point);
  return `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
}

function tokenFromStructuredDraft(draft = {}) {
  const mode = String(draft.inputMode || 'Absolute');
  const axis = normalizeAxis(draft.axis || 'X');
  const sign = normalizeSign(draft.sign);
  const len = Math.abs(finiteNumber(draft.lengthMm, 1000));

  if (mode === 'Relative') {
    return `@${finiteNumber(draft.dx)},${finiteNumber(draft.dy)},${finiteNumber(draft.dz)}`;
  }

  if (mode === 'Bearing') {
    return `@${len}<${finiteNumber(draft.angleDeg, 0)}`;
  }

  if (mode === 'Length') {
    return `${axis}${len * sign}`;
  }

  const current = draft.currentPoint ? clonePoint(draft.currentPoint) : { x: 0, y: 0, z: 0 };
  return [
    current.x + finiteNumber(draft.dx),
    current.y + finiteNumber(draft.dy),
    current.z + finiteNumber(draft.dz),
  ].join(',');
}

function pointRow(point, index) {
  const p = clonePoint(point);
  return {
    index,
    point: p,
    x: p.x.toFixed(1),
    y: p.y.toFixed(1),
    z: p.z.toFixed(1),
    coord: formatPoint(p),
  };
}

export function createSplineDraft(startPoint = null, options = {}) {
  const start = startPoint ? clonePoint(startPoint) : null;

  return {
    guideType: 'SPLINE',
    pipelineRef: options.pipelineRef || '',
    inputMode: options.inputMode || 'Absolute',
    axis: normalizeAxis(options.axis || 'X'),
    sign: normalizeSign(options.sign ?? 1),
    lengthMm: finiteNumber(options.lengthMm, 1000),
    angleDeg: finiteNumber(options.angleDeg, 0),
    dx: finiteNumber(options.dx, 0),
    dy: finiteNumber(options.dy, 0),
    dz: finiteNumber(options.dz, 0),
    commandText: String(options.commandText || ''),
    points: start ? [start] : [],
    currentPoint: start,
    previewPoint: null,
    previewToken: null,
    errors: [],
  };
}

export function setSplineStartPoint(draft = {}, point) {
  const start = clonePoint(point);

  return {
    ...draft,
    points: [start],
    currentPoint: start,
    previewPoint: null,
    previewToken: null,
    errors: [],
  };
}

export function resolveSplinePointPreview(draft = {}) {
  const currentPoint = draft.currentPoint ? clonePoint(draft.currentPoint) : null;

  if (!currentPoint) {
    const token = String(draft.commandText || '').trim();

    if (!token) {
      return {
        ...draft,
        previewPoint: null,
        previewToken: null,
        errors: [],
      };
    }

    const parsed = parseDraftCommand(token, { x: 0, y: 0, z: 0 }, {
      axisLock: normalizeAxis(draft.axis || 'X'),
    });

    if (!parsed.ok) {
      return {
        ...draft,
        previewPoint: null,
        previewToken: token,
        errors: [`Spline point parse failed: ${(parsed.diagnostics || []).join(', ')}`],
      };
    }

    return {
      ...draft,
      commandText: token,
      previewPoint: clonePoint(parsed.toPoint),
      previewToken: token,
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
      previewToken: token,
      errors: [`Spline point parse failed: ${(parsed.diagnostics || []).join(', ')}`],
    };
  }

  return {
    ...draft,
    commandText: token,
    previewPoint: clonePoint(parsed.toPoint),
    previewToken: token,
    errors: [],
  };
}

export function updateSplineDraftField(draft = {}, field, value) {
  const next = {
    ...draft,
    axis: normalizeAxis(draft.axis || 'X'),
    sign: normalizeSign(draft.sign ?? 1),
    inputMode: draft.inputMode || 'Absolute',
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
    next.inputMode = String(value || 'Absolute');
    next.commandText = tokenFromStructuredDraft(next);
  } else if (field === 'lengthMm') {
    next.lengthMm = Math.abs(finiteNumber(value, 1000));
    next.inputMode = 'Length';
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

  return resolveSplinePointPreview(next);
}

export function addSplinePoint(draft = {}) {
  const resolved = resolveSplinePointPreview(draft);

  if (resolved.errors?.length) return resolved;
  if (!resolved.previewPoint) {
    return {
      ...resolved,
      errors: ['Spline requires a point before Add.'],
    };
  }

  const point = clonePoint(resolved.previewPoint);
  const points = [...(draft.points || []), point];

  return {
    ...resolved,
    points,
    currentPoint: point,
    previewPoint: null,
    previewToken: null,
    commandText: '',
    errors: [],
  };
}

export function addSplineAbsolutePoint(draft = {}, point) {
  if (!draft.currentPoint || !(draft.points || []).length) {
    return setSplineStartPoint(draft, point);
  }

  return addSplinePoint({
    ...draft,
    commandText: `${finiteNumber(point.x)},${finiteNumber(point.y)},${finiteNumber(point.z)}`,
  });
}

export function setSplinePreviewPoint(draft = {}, point) {
  if (!point) return draft;

  if (!draft.currentPoint) {
    return {
      ...draft,
      previewPoint: clonePoint(point),
      previewToken: `${finiteNumber(point.x)},${finiteNumber(point.y)},${finiteNumber(point.z)}`,
      errors: [],
    };
  }

  return resolveSplinePointPreview({
    ...draft,
    commandText: `${finiteNumber(point.x)},${finiteNumber(point.y)},${finiteNumber(point.z)}`,
  });
}

export function undoSplinePoint(draft = {}) {
  const points = [...(draft.points || [])];

  if (!points.length) {
    return {
      ...draft,
      currentPoint: null,
      previewPoint: null,
      previewToken: null,
      errors: [],
    };
  }

  points.pop();

  return {
    ...draft,
    points,
    currentPoint: points[points.length - 1] || null,
    previewPoint: null,
    previewToken: null,
    errors: [],
  };
}

export function clearSplineDraft(draft = {}) {
  return {
    ...draft,
    points: [],
    currentPoint: null,
    previewPoint: null,
    previewToken: null,
    commandText: '',
    errors: [],
  };
}

export function finishSplineDraftPayload(draft = {}) {
  const points = (draft.points || []).map(clonePoint);

  if (points.length < 2) {
    return {
      ok: false,
      errors: ['Spline guide requires at least 2 points before Finish.'],
      points,
    };
  }

  return {
    ok: true,
    errors: [],
    guideType: 'SPLINE',
    pipelineRef: draft.pipelineRef || '',
    points,
  };
}

export function splinePointTableRows(draft = {}) {
  return (draft.points || []).map((point, idx) => pointRow(point, idx + 1));
}
