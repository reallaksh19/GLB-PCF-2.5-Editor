import { componentSearch, SEARCH_MODE } from './componentSearch.js';

export const LOOKUP_STATUS = Object.freeze({
  FOUND: 'FOUND',
  NO_EXACT_MATCH: 'NO_EXACT_MATCH',
  CATALOG_ROW_MISSING: 'CATALOG_ROW_MISSING',
  INVALID_ASSETS: 'INVALID_ASSETS',
});

export function lookupComponentExact(query, assets = {}, options = {}) {
  const index = assets.searchIndex ?? assets.index;
  if (!Array.isArray(index?.entries)) {
    return invalidAssets('searchIndex.entries is required');
  }

  const aliases = assets.aliases ?? [];
  const catalogs = assets.catalogs ?? {};
  const filters = options.filters ?? {};
  const search = componentSearch(query, index, {
    aliases,
    filters,
    mode: SEARCH_MODE.EXACT_ALIAS_ONLY,
  });

  if (!search.ok) {
    return {
      ok: false,
      status: LOOKUP_STATUS.NO_EXACT_MATCH,
      mode: search.mode,
      id: null,
      entry: null,
      row: null,
      diagnostics: search.diagnostics,
      noFallbackPolicy: index.noFallbackPolicy ?? null,
    };
  }

  const match = search.results[0];
  const row = findCatalogRow(match.entry, catalogs);
  if (!row) {
    return {
      ok: false,
      status: LOOKUP_STATUS.CATALOG_ROW_MISSING,
      mode: search.mode,
      id: match.id,
      entry: match.entry,
      row: null,
      diagnostics: [{ code: 'CATALOG_ROW_MISSING', id: match.id, source: match.entry.source }],
      noFallbackPolicy: index.noFallbackPolicy ?? null,
    };
  }

  return {
    ok: true,
    status: LOOKUP_STATUS.FOUND,
    mode: search.mode,
    id: match.id,
    family: match.entry.family,
    dataStatus: row.dataStatus ?? match.entry.dataStatus ?? null,
    entry: match.entry,
    row,
    provenance: row.provenance ?? rowProvenance(row),
    audit: rowAudit(row, match.entry),
    diagnostics: [],
    noFallbackPolicy: index.noFallbackPolicy ?? null,
  };
}

function findCatalogRow(entry, catalogs) {
  const catalog = catalogForSource(entry.source, catalogs);
  const rows = Array.isArray(catalog) ? catalog : catalog?.rows;
  return rows?.find((row) => row.id === entry.id) ?? null;
}

function catalogForSource(source, catalogs) {
  if (catalogs instanceof Map) return catalogs.get(source);
  if (catalogs?.[source]) return catalogs[source];
  return null;
}

function rowProvenance(row) {
  return {
    standard: row.standard ?? null,
    source: row.source ?? null,
    datasetVersion: row.datasetVersion ?? null,
    dataStatus: row.dataStatus ?? null,
    sourceRowNumber: row.sourceRowNumber ?? row.sourceRow ?? null,
  };
}

function rowAudit(row, entry) {
  const provenance = row.provenance ?? rowProvenance(row);
  return {
    id: row.id,
    family: entry.family,
    indexSource: entry.source,
    source: provenance.source ?? row.source ?? null,
    datasetVersion: provenance.datasetVersion ?? row.datasetVersion ?? null,
    dataStatus: provenance.dataStatus ?? row.dataStatus ?? entry.dataStatus ?? null,
    sourceRowNumber: provenance.sourceRowNumber ?? row.sourceRowNumber ?? row.sourceRow ?? null,
  };
}

function invalidAssets(message) {
  return {
    ok: false,
    status: LOOKUP_STATUS.INVALID_ASSETS,
    mode: SEARCH_MODE.EXACT_ALIAS_ONLY,
    id: null,
    entry: null,
    row: null,
    diagnostics: [{ code: 'INVALID_LOOKUP_ASSETS', message }],
    noFallbackPolicy: null,
  };
}
