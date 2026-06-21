import {
  lookupComponentExact,
  LOOKUP_STATUS,
  PHASE4_DATASETS,
} from '../vendor/pipe-component-data/src/index.js';

export const BENCHMARK_PCD_DIAGNOSTIC_CODES = Object.freeze({
  catalogRowMissing: 'PCD_CATALOG_ROW_MISSING',
});

export function collectBenchmarkPcdDiagnostics(canonical, datasets = PHASE4_DATASETS) {
  const assets = createLookupAssets(datasets);
  const targets = collectLookupTargets(canonical);
  const lookupResults = targets.map((target) => lookupTarget(target, assets));
  const diagnostics = lookupResults.flatMap((result) => result.diagnostic ? [result.diagnostic] : []);
  const resolved = lookupResults.flatMap((result) => result.resolved ? [result.resolved] : []);

  return {
    diagnostics,
    resolved,
    summary: {
      lookupCount: targets.length,
      resolvedCount: resolved.length,
      missingCount: diagnostics.length,
      catalogComplete: diagnostics.length === 0,
    },
  };
}

function lookupTarget(target, assets) {
  const hit = lookupComponentExact(target.key, assets, { filters: target.query });
  if (hit.status === LOOKUP_STATUS.FOUND) {
    return {
      resolved: { targetId: target.id, kind: target.kind, status: hit.status, matchKey: hit.id, dataStatus: hit.dataStatus ?? null, provenance: hit.provenance ?? null },
    };
  }
  return {
    diagnostic: {
      severity: 'WARNING',
      code: BENCHMARK_PCD_DIAGNOSTIC_CODES.catalogRowMissing,
      message: `${target.label} not found in current PCD dataset.`,
      targetId: target.id,
      kind: target.kind,
      query: target.query,
      lookupKey: target.key,
      lookupStatus: hit.status,
      pcdDiagnostics: hit.diagnostics || [],
      noFallbackPolicy: hit.noFallbackPolicy || assets.searchIndex.noFallbackPolicy,
    },
  };
}

function collectLookupTargets(canonical) {
  const specs = new Map((canonical?.specs || []).map((spec) => [spec.id, spec]));
  const targets = pipeTargets(canonical?.segments || [], specs);
  for (const feature of canonical?.features || []) {
    if (feature.type === 'FLANGE_PAIR') targets.push(flangeTarget(feature, specs.get(feature.spec)));
    if (feature.type === 'AUTO_BEND_CANDIDATE') targets.push(elbowTarget(feature, specs.get(feature.spec)));
    if (feature.type === 'AUTO_TEE_CANDIDATE') targets.push(teeTarget(feature, specs.get(feature.runSpec), specs.get(feature.branchSpec)));
  }
  return targets.filter(Boolean);
}

function pipeTargets(segments, specs) {
  const usedSpecIds = [...new Set(segments.map((segment) => segment.spec).filter(Boolean))];
  return usedSpecIds.map((specId) => {
    const spec = specs.get(specId);
    if (!spec) return null;
    return {
      id: `pipe:${specId}`,
      kind: 'PIPE',
      key: pipeKey({ nps: pcdNps(spec.size), schedule: spec.sch }),
      label: `${specId} pipe ${spec.size} SCH${spec.sch}`,
      query: { componentType: 'PIPE', nps: pcdNps(spec.size), schedule: spec.sch },
    };
  }).filter(Boolean);
}

function flangeTarget(feature, spec) {
  if (!spec) return null;
  const q = { componentType: 'FLANGE', subtype: feature.flangeType || 'WN', nps: pcdNps(spec.size), classRating: feature.class || spec.class, facing: feature.facing || 'RF' };
  return { id: feature.id, kind: 'FLANGE', key: flangeKey(q), label: `${feature.spec} flange ${q.subtype} ${q.facing} CLASS${q.classRating} ${spec.size}`, query: q };
}

function elbowTarget(feature, spec) {
  if (!spec) return null;
  const subtype = `ELBOW_${feature.angle || 90}_${feature.subtype || 'LR'}`.toUpperCase();
  const q = { componentType: 'FITTING', subtype, nps: pcdNps(spec.size), schedule: spec.sch };
  return { id: feature.id, kind: 'FITTING', key: fittingKey(q), label: `${feature.spec} elbow ${spec.size} SCH${spec.sch} ${subtype}`, query: q };
}

function teeTarget(feature, runSpec, branchSpec) {
  if (!runSpec || !branchSpec) return null;
  const subtype = `TEE_${feature.subtype || 'REDUCING'}`.toUpperCase();
  const q = { componentType: 'FITTING', subtype, nps: `${pcdNps(runSpec.size)}x${pcdNps(branchSpec.size)}`, schedule: runSpec.sch };
  return { id: feature.id, kind: 'FITTING', key: fittingKey(q), label: `${feature.runSpec} × ${feature.branchSpec} reducing tee ${runSpec.size} × ${branchSpec.size} SCH${runSpec.sch}`, query: q };
}

function createLookupAssets(datasets) {
  const catalogs = {
    pipeSchedules: withIds(datasets.pipeSchedules, pipeId),
    flanges: withIds(datasets.flanges, flangeId),
    valves: withIds(datasets.valves, valveId),
    fittings: withIds(datasets.fittings, fittingId),
  };
  return {
    searchIndex: {
      noFallbackPolicy: 'Exact benchmark catalog diagnostics only. No nearest size, class, schedule, family, or fabricated dimension fallback.',
      entries: [
        ...entries(catalogs.pipeSchedules, 'PIPE', 'pipeSchedules', pipeFilters),
        ...entries(catalogs.flanges, 'FLANGE', 'flanges', flangeFilters),
        ...entries(catalogs.valves, 'VALVE', 'valves', valveFilters),
        ...entries(catalogs.fittings, 'FITTING', 'fittings', fittingFilters),
      ],
    },
    aliases: [],
    catalogs,
  };
}

function withIds(rows = [], idFn) {
  return rows.map((row) => ({ ...row, id: row.id || idFn(row) }));
}

function entries(rows, family, source, filtersFn) {
  return rows.map((row) => ({ id: row.id, family, source, dataStatus: row.dataStatus, aliases: [row.id], filters: filtersFn(row) }));
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

function pcdNps(size) {
  const raw = String(size || '').trim().toUpperCase();
  return raw.endsWith('IN') ? raw.slice(0, -2) : raw;
}

function pipeId(row) {
  return pipeKey({ nps: row.nps, schedule: row.schedule });
}

function flangeId(row) {
  return flangeKey({ subtype: row.subtype, nps: row.nps, classRating: row.classRating, facing: row.facing });
}

function valveId(row) {
  return `VALVE|${row.valveType}|NPS${row.nps}|CL${row.classRating}|${row.facing}`;
}

function fittingId(row) {
  return fittingKey({ subtype: row.subtype, nps: row.nps, schedule: row.schedule });
}

function pipeKey(q) {
  return `PIPE|NPS${q.nps}|SCH${q.schedule}`;
}

function flangeKey(q) {
  return `FLANGE|${q.subtype}|NPS${q.nps}|CL${q.classRating}|${q.facing}`;
}

function fittingKey(q) {
  return `FITTING|${q.subtype}|NPS${q.nps}|SCH${q.schedule}`;
}
