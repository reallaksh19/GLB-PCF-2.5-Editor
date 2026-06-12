/**
 * @file domains/piping/pipe-data-enrichment.js
 * @description CEG-native enrichment bridge for the vendored pipe-component-data
 *              package.  Derives dimension lookups from canonical component
 *              attributes and writes verified dimensional data onto
 *              component.derived — never fabricating values and never
 *              touching anchors or geometry.
 *
 * Imports the vendored package via a relative path so the module resolves
 * identically in the browser (no import map needed) and under plain node.
 */

import { createPipeDataDb } from '../../vendor/pipe-component-data/src/index.js';

export const PIPE_DATA_DIAGNOSTIC_CODES = Object.freeze({
  insufficientKeys: 'PIPE_DATA_INSUFFICIENT_KEYS',
  lookupMiss: 'PIPE_DATA_LOOKUP_MISS',
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

/**
 * Derive a pipe-component-data lookup query from one CEG component.
 *
 * @param {Object} component Canonical component record.
 * @returns {{kind: string, query: Object}|null} Lookup descriptor, or null
 *          when the component lacks the keys needed for any lookup
 *          (e.g. a bore-only DXF component).
 */
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
    return { kind: 'pipe', query: { nps, schedule } };
  }
  if (type === 'FLANGE') {
    if (!nps || !classRating) return null;
    return {
      kind: 'flange',
      query: { subtype: subtype || 'WN', nps, classRating, facing: facing || 'RF' },
    };
  }
  if (type === 'VALVE') {
    if (!subtype || !nps || !classRating) return null;
    return {
      kind: 'valve',
      query: { valveType: subtype, nps, classRating, facing: facing || 'RF' },
    };
  }
  if (FITTING_TYPES.has(type)) {
    if (!subtype || !nps || !schedule) return null;
    return { kind: 'fitting', query: { subtype, nps, schedule } };
  }
  return null;
}

function lookupFor(db, derived) {
  if (derived.kind === 'pipe') return db.lookupPipe(derived.query);
  if (derived.kind === 'flange') return db.lookupFlange(derived.query);
  if (derived.kind === 'valve') return db.lookupValve(derived.query);
  if (derived.kind === 'fitting') return db.lookupFitting(derived.query);
  return { ok: false, code: 'PIPE_DATA_UNKNOWN_KIND', query: derived.query };
}

function pickValveFaceToFace(row, facing) {
  if (facing === 'RTJ') return row.ffRtjMm;
  if (facing === 'BW') return row.ffBwMm;
  return row.ffRfMm ?? row.lengthMm;
}

function mapDimensions(derived, row) {
  if (derived.kind === 'pipe') {
    return {
      odMm: row.odMm,
      wallMm: row.wallMm,
      boreMm: row.idMm,
      weightKgPerM: row.weightKgPerM,
      materialDensityKgM3: row.materialDensityKgM3,
    };
  }
  if (derived.kind === 'flange') {
    return {
      flangeOdMm: row.flangeOdMm,
      flangeThicknessMm: row.flangeThicknessMm,
      hubDiaMm: row.hubDiaMm,
      weldDiaMm: row.weldDiaMm,
      hubLengthMm: row.hubLengthMm,
      rfDiaMm: row.rfDiaMm,
      rfHeightMm: row.rfHeightMm,
      pcdMm: row.pcdMm,
      boltCount: row.boltCount,
      weightKg: row.weightKg,
    };
  }
  if (derived.kind === 'valve') {
    return {
      faceToFaceMm: pickValveFaceToFace(row, derived.query.facing),
      ffRfMm: row.ffRfMm,
      ffRtjMm: row.ffRtjMm,
      ffBwMm: row.ffBwMm,
      boreMm: row.boreMm,
      heightMm: row.heightMm,
      handwheelDiaMm: row.handwheelDiaMm,
      weightKg: row.weightKg,
    };
  }
  return {
    centerlineRadiusMm: row.centerlineRadiusMm,
    angleDeg: row.angleDeg,
    developedLengthMm: row.developedLengthMm,
    weightKg: row.weightKg,
  };
}

function withoutEmptyValues(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function pushDiagnostic(component, code, details) {
  component.diagnostics = Array.isArray(component.diagnostics) ? component.diagnostics : [];
  component.diagnostics.push({
    severity: 'WARNING',
    code,
    message: code,
    componentId: component.id,
    details: details || {},
  });
}

/**
 * Enrich a Canonical Edit Graph with verified dimensional data from the
 * pipe-component-data datasets.  The input graph is never mutated; a deep
 * clone is returned.  Anchors and geometry are never touched, and values
 * are never fabricated — misses only add non-fatal diagnostics.
 *
 * @param {Object} ceg Canonical Edit Graph.
 * @param {Object} [db] pipe-component-data db (injectable for tests).
 * @returns {{ceg: Object, enriched: number, missed: number}}
 */
export function enrichCegWithPipeData(ceg, db = createPipeDataDb()) {
  const clone = structuredClone(ceg);
  let enriched = 0;
  let missed = 0;

  for (const component of Object.values(clone?.components || {})) {
    const derived = deriveQuery(component);
    if (!derived) {
      pushDiagnostic(component, PIPE_DATA_DIAGNOSTIC_CODES.insufficientKeys, {
        componentType: component?.type || null,
      });
      continue;
    }

    const hit = lookupFor(db, derived);
    if (!hit.ok) {
      missed += 1;
      pushDiagnostic(component, PIPE_DATA_DIAGNOSTIC_CODES.lookupMiss, {
        kind: derived.kind,
        query: hit.query || derived.query,
        code: hit.code || null,
      });
      continue;
    }

    enriched += 1;
    const dimensions = withoutEmptyValues(mapDimensions(derived, hit.row));
    component.derived = {
      ...(component.derived || {}),
      dimensions: {
        ...(component.derived?.dimensions || {}),
        ...dimensions,
      },
      pipeData: {
        matchKey: hit.matchKey,
        ...(hit.provenance || {}),
      },
    };
  }

  return { ceg: clone, enriched, missed };
}
