import { createResolverResult } from './masterdb-contract.js';
import { normalizeQuery, buildMatchKey } from './masterdb-normalize.js';

function scoreRecord(query, record) {
  let score = 0;
  const warnings = [];
  if (!query.component || query.component !== record.component) return { score: -1, warnings: ['COMPONENT_MISMATCH'] };
  score += 50;
  if (query.subtype && record.subtype === query.subtype) score += 20;
  else if (query.subtype && record.subtype !== query.subtype) warnings.push('SUBTYPE_FALLBACK');
  if (query.size && record.size === query.size) score += 20;
  else if (query.size && record.size !== query.size) warnings.push('SIZE_FALLBACK');
  if (query.rating && record.rating === query.rating) score += 10;
  else if (query.rating && record.rating !== query.rating) warnings.push('RATING_FALLBACK');
  if (query.endType && record.endType === query.endType) score += 5;
  else if (query.endType && record.endType !== query.endType) warnings.push('ENDTYPE_FALLBACK');
  if (query.facing && record.facing === query.facing) score += 5;
  else if (query.facing && record.facing !== query.facing) warnings.push('FACING_FALLBACK');
  return { score, warnings };
}

export function createMasterDbResolver(store) {
  if (!store) throw new Error('Master DB resolver requires a store');

  function resolveComponent(query = {}) {
    const normalized = normalizeQuery(query);
    const rows = store.getRows();
    const ranked = rows
      .map((record) => ({ record, ...scoreRecord(normalized, record) }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score || String(a.record.component).localeCompare(String(b.record.component)));

    if (!ranked.length) {
      const result = createResolverResult({
        ok: false,
        source: 'manual',
        matchKey: null,
        resolved: null,
        alternatives: [],
        warnings: ['NO_MATCH'],
      });
      store.setLastResolution(result);
      return result;
    }

    const best = ranked[0];
    const exact = best.score >= 100;
    const result = createResolverResult({
      ok: true,
      source: exact ? 'master-db' : 'fallback',
      matchKey: buildMatchKey(best.record),
      resolved: best.record,
      alternatives: ranked.slice(1, 4).map((row) => row.record),
      warnings: exact ? [] : Array.from(new Set(best.warnings.concat('FALLBACK_MATCH'))),
    });
    store.setLastResolution(result);
    return result;
  }

  return { resolveComponent };
}
