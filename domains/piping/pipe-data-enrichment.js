/**
 * @file domains/piping/pipe-data-enrichment.js
 * @description CEG-native enrichment using PipeComponentData public exact lookup.
 */

import {
  lookupComponentExact,
  LOOKUP_STATUS,
  PHASE4_DATASETS,
} from '../../vendor/pipe-component-data/src/index.js';

export const PIPE_DATA_DIAGNOSTIC_CODES = Object.freeze({
  insufficientKeys: 'PIPE_DATA_INSUFFICIENT_KEYS',
  lookupMiss: 'PIPE_DATA_LOOKUP_MISS',
  catalogRowMissing: 'PIPE_DATA_CATALOG_ROW_MISSING',
  invalidAssets: 'PIPE_DATA_INVALID_ASSETS',
});

const FITTING_TYPES = new Set(['ELBOW', 'BEND', 'TEE', 'REDUCER']);

function attrValue(attributes, ...keys) {
  for (const key of keys) {
    const value = attributes?.[key];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function normalizeNps(raw) {
  return String(raw || '').trim();
}

function normalizeClassRating(raw) {
  return String(raw || '').replace(/#/g, '').trim();
}

function normalizeFacing(raw) {
  const facing = String(raw || '').trim().toUpperCase();
  if (facing === 'RAISED' || facing === 'RAISED FACE') return 'RF';
  return facing;
}

export function deriveQuery(component) {
  const attributes = component?.attributes || {};
  const type = String(component?.type || attrValue(attributes, 'COMPONENT', 'TYPE') || '').toUpperCase();
  const nps = normalizeNps(attrValue(attributes, 'NPS', 'SIZE'));
  const schedule = String(attrValue(attributes, 'SCHEDULE', 'SCH') || '').trim();
  const classRating = normalizeClassRating(attrValue(attributes, 'CLASS', 'RATING'));
  const facing = normalizeFacing(attrValue(attributes, 'FACING'));
  const subtype = String(attrValue(attributes, 'SUBTYPE') || '').trim().toUpperCase();

  if (type === 'PIPE' || type === 'LINE') {
    if (!nps || !schedule) return null;
    return { kind: 'pipe', query: { componentType: 'PIPE', nps, schedule } };
  }
  if (type === 'FLANGE') {
    if (!nps || !classRating) return null;
    return { kind: 'flange', query: { componentType: 'FLANGE', subtype: subtype || 'WN', nps, classRating, facing: facing || 'RF' } };
  }
  if (type === 'VALVE') {
    if (!subtype || !nps || !classRating) return null;
    return { kind: 'valve', query: { componentType: 'VALVE', valveType: subtype, nps, classRating, facing: facing || 'RF' } };
  }
  if (FITTING_TYPES.has(type)) {
    if (!subtype || !nps || !schedule) return null;
    return { kind: 'fitting', query: { componentType: 'FITTING', subtype, nps, schedule } };
  }
  return null;
}

export function createPipeDataExactLookupAssets(datasets = PHASE4_DATASETS) {
  const catalogs = {
    pipeSchedules: withIds(datasets.pipeSchedules, pipeId),
    flanges: withIds(datasets.flanges, flangeId),
    valves: withIds(datasets.valves, valveId),
    fittings: withIds(datasets.fittings, fittingId),
  };
  return {
    searchIndex: {
      noFallbackPolicy: 'Exact component lookup only. No nearest size, class, schedule, family, or fabricated dimension fallback.',
      entries: [
        ...catalogEntries(catalogs.pipeSchedules, 'PIPE', 'pipeSchedules', pipeFilters),
        ...catalogEntries(catalogs.flanges, 'FLANGE', 'flanges', flangeFilters),
        ...catalogEntries(catalogs.valves, 'VALVE', 'valves', valveFilters),
        ...catalogEntries(catalogs.fittings, 'FITTING', 'fittings', fittingFilters),
      ],
    },
    aliases: [],
    catalogs,
  };
}

function withIds(rows = [], idFn) {
  return rows.map((row) => ({ ...row, id: idFn(row) }));
}

function catalogEntries(rows, family, source, filtersFn) {
  return rows.map((row) => ({
    id: row.id,
    family,
    source,
    dataStatus: row.dataStatus,
    description: row.id,
    aliases: [row.id],
    filters: filtersFn(row),
  }));
}

function pipeFilters(row) {
  return { componentType: 'PIPE', nps: row.nps, schedule: row.schedule };
}

function flangeFilters(row) {
  return { componentType: 'FLANGE', subtype: row.subtype, nps: row.nps, classRating: row.classRating, facing: row.facing };
}

function valveFilters(row) {
  return { componentType: 'VALVE', valveType: row.valveType, nps: row.nps, classRating: row.classRating, facing: row.facing };
}

function fittingFilters(row) {
  return { componentType: 'FITTING', subtype: row.subtype, nps: row.nps, schedule: row.schedule };
}

function pipeId(row) {
  return `PIPE|NPS${row.nps}|SCH${row.schedule}`;
}

function flangeId(row) {
  return `FLANGE|${row.subtype}|NPS${row.nps}|CL${row.classRating}|${row.facing}`;
}

function valveId(row) {
  return `VALVE|${row.valveType}|NPS${row.nps}|CL${row.classRating}|${row.facing}`;
}

function fittingId(row) {
  return `FITTING|${row.subtype}|NPS${row.nps}|SCH${row.schedule}`;
}

function lookupForExact(assets, derived) {
  return lookupComponentExact(exactLookupText(derived), assets, { filters: derived.query });
}

function exactLookupText(derived) {
  const query = derived.query;
  if (derived.kind === 'pipe') return pipeId(query);
  if (derived.kind === 'flange') return flangeId(query);
  if (derived.kind === 'valve') return valveId(query);
  if (derived.kind === 'fitting') return fittingId(query);
  return String(derived.kind || 'UNKNOWN');
}

function pickValveFaceToFace(row, facing) {
  if (facing === 'RTJ') return row.ffRtjMm;
  if (facing === 'BW') return row.ffBwMm;
  return row.ffRfMm ?? row.lengthMm;
}

function mapDimensions(derived, row) {
  if (derived.kind === 'pipe') {
    return { odMm: row.odMm, wallMm: row.wallMm, boreMm: row.idMm, weightKgPerM: row.weightKgPerM, materialDensityKgM3: row.materialDensityKgM3 };
  }
  if (derived.kind === 'flange') {
    return { flangeOdMm: row.flangeOdMm, flangeThicknessMm: row.flangeThicknessMm, hubDiaMm: row.hubDiaMm, weldDiaMm: row.weldDiaMm, hubLengthMm: row.hubLengthMm, rfDiaMm: row.rfDiaMm, rfHeightMm: row.rfHeightMm, pcdMm: row.pcdMm, boltCount: row.boltCount, weightKg: row.weightKg };
  }
  if (derived.kind === 'valve') {
    return { faceToFaceMm: pickValveFaceToFace(row, derived.query.facing), ffRfMm: row.ffRfMm, ffRtjMm: row.ffRtjMm, ffBwMm: row.ffBwMm, boreMm: row.boreMm, heightMm: row.heightMm, handwheelDiaMm: row.handwheelDiaMm, weightKg: row.weightKg };
  }
  return { centerlineRadiusMm: row.centerlineRadiusMm, angleDeg: row.angleDeg, developedLengthMm: row.developedLengthMm, weightKg: row.weightKg };
}

function withoutEmptyValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function diagnosticCodeForStatus(status) {
  if (status === LOOKUP_STATUS.CATALOG_ROW_MISSING) return PIPE_DATA_DIAGNOSTIC_CODES.catalogRowMissing;
  if (status === LOOKUP_STATUS.INVALID_ASSETS) return PIPE_DATA_DIAGNOSTIC_CODES.invalidAssets;
  return PIPE_DATA_DIAGNOSTIC_CODES.lookupMiss;
}

function pushDiagnostic(component, code, details) {
  component.diagnostics = Array.isArray(component.diagnostics) ? component.diagnostics : [];
  component.diagnostics.push({ severity: 'WARNING', code, message: code, componentId: component.id, details: details || {} });
}

export function enrichCegWithPipeData(ceg, assets = createPipeDataExactLookupAssets()) {
  const clone = structuredClone(ceg);
  let enriched = 0;
  let missed = 0;

  for (const component of Object.values(clone?.components || {})) {
    const derived = deriveQuery(component);
    if (!derived) {
      pushDiagnostic(component, PIPE_DATA_DIAGNOSTIC_CODES.insufficientKeys, { componentType: component?.type || null });
      continue;
    }

    const hit = lookupForExact(assets, derived);
    if (hit.status !== LOOKUP_STATUS.FOUND) {
      missed += 1;
      pushDiagnostic(component, diagnosticCodeForStatus(hit.status), {
        kind: derived.kind,
        query: derived.query,
        status: hit.status,
        diagnostics: hit.diagnostics || [],
        noFallbackPolicy: hit.noFallbackPolicy || null,
      });
      continue;
    }

    enriched += 1;
    const dimensions = withoutEmptyValues(mapDimensions(derived, hit.row));
    component.derived = {
      ...(component.derived || {}),
      dimensions: { ...(component.derived?.dimensions || {}), ...dimensions },
      pipeData: { matchKey: hit.id, ...(hit.provenance || {}) },
    };
  }

  return { ceg: clone, enriched, missed };
}
