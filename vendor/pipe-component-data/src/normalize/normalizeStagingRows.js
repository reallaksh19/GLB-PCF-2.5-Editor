import { derivedValue, numericSource, sourceValue, toFiniteNumber, unavailable } from './valueBasis.js';
import { makeNormalizedRow, NORMALIZATION_DATASET_VERSION } from './rowEnvelope.js';

export function normalizeStagingRows(staging, options = {}) {
  return (staging.rows ?? []).map((row) => normalizeStagingRow(row, options));
}

export function normalizeStagingRow(row, options = {}) {
  const family = row.inferred?.family;
  if (family === 'PIPE') return normalizePipe(row, options);
  if (family === 'VALVE') return normalizeValve(row, options);
  return normalizeUnsupported(row, options);
}

function normalizePipe(row, options) {
  const od = raw(row, ['od', 'OD', 'outside diameter']);
  const wall = raw(row, ['wall', 'WALL', 'thk']);
  const nps = raw(row, ['nps', 'NPS', 'nb']);
  const schedule = raw(row, ['schedule', 'SCH', 'sch']) ?? row.inferred?.schedule ?? 'UNKNOWN';
  const odNumber = toFiniteNumber(od);
  const wallNumber = toFiniteNumber(wall);
  return makeNormalizedRow({
    id: `PIPE|NPS${nps ?? 'UNKNOWN'}|SCH${schedule}`,
    componentType: 'PIPE',
    subtype: 'SCHEDULED_PIPE',
    keys: { nps: sourceValue(nps), schedule: sourceValue(schedule) },
    dimensions: {
      odMm: numericSource(od, 'mm'),
      wallMm: numericSource(wall, 'mm'),
      idMm: odNumber !== null && wallNumber !== null
        ? derivedValue(roundDimension(odNumber - 2 * wallNumber), 'OD - 2 * WALL', { odMm: odNumber, wallMm: wallNumber }, 'mm')
        : unavailable('PIPE_ID_REQUIRES_OD_AND_WALL'),
    },
    weights: { weightKgPerM: numericSource(raw(row, ['weight', 'kg/m', 'wt']), 'kg/m') },
    provenance: provenance(row, options, 'ASME B36.10'),
    sourceRefs: [sourceRef(row)],
  });
}

function normalizeValve(row, options) {
  const nps = raw(row, ['nps', 'NPS', 'nb']);
  const cls = row.inferred?.classRating ?? raw(row, ['class', 'rating']);
  const facing = raw(row, ['facing']) ?? 'RF';
  return makeNormalizedRow({
    id: `VALVE|GATE|NPS${nps ?? 'UNKNOWN'}|CL${cls ?? 'UNKNOWN'}|${facing}`,
    componentType: 'VALVE',
    subtype: 'GATE',
    keys: { nps: sourceValue(nps), classRating: sourceValue(cls), facing: sourceValue(facing) },
    dimensions: {
      faceToFaceRfMm: numericSource(raw(row, ['rf', 'RF', 'rf ff']), 'mm'),
      faceToFaceRtjMm: numericSource(raw(row, ['rtj', 'RTJ']), 'mm'),
      buttWeldLengthMm: numericSource(raw(row, ['bw', 'BW']), 'mm'),
      heightMm: numericSource(raw(row, ['height', 'H']), 'mm'),
    },
    weights: { weightKg: numericSource(raw(row, ['weight', 'kg', 'wt']), 'kg') },
    provenance: provenance(row, options, 'ASME B16.10'),
    sourceRefs: [sourceRef(row)],
  });
}

function normalizeUnsupported(row, options) {
  const family = row.inferred?.family ?? 'UNKNOWN';
  return makeNormalizedRow({
    id: `${family}|ROW${row.sourceRowNumber ?? 'UNKNOWN'}`,
    componentType: family,
    subtype: row.inferred?.subfamily ?? null,
    provenance: provenance(row, options, 'UNDECLARED_SOURCE_STANDARD', 'PARTIAL'),
    sourceRefs: [sourceRef(row)],
    diagnostics: [{ severity: 'WARNING', code: 'NORMALIZER_NOT_IMPLEMENTED', family }],
  });
}

function provenance(row, options, standard, dataStatus = 'PARTIAL') {
  return {
    standard,
    source: row.sourceId,
    datasetVersion: options.datasetVersion ?? NORMALIZATION_DATASET_VERSION,
    dataStatus,
  };
}

function sourceRef(row) {
  return { source: row.sourceId, rowNumber: row.sourceRowNumber };
}

function roundDimension(value, decimals = 6) {
  return Number(value.toFixed(decimals));
}

function raw(row, names) {
  const wanted = names.map((name) => String(name).toLowerCase());
  for (const [key, value] of Object.entries(row.raw ?? {})) {
    const clean = key.replace(/@\d+$/, '').toLowerCase();
    if (wanted.includes(clean)) return value;
  }
  return null;
}
