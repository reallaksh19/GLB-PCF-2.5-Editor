import { createResolverResult } from './masterdb-contract.js';
import { normalizeQuery, buildMatchKey } from './masterdb-normalize.js';

function scoreRecord(query, record) {
  let score = 1000;
  const warnings = [];
  if (!query.component || query.component !== record.component) return { score: -1, warnings: ['COMPONENT_MISMATCH'] };

  if (query.subtype && record.subtype === query.subtype) score += 20;
  else if (query.subtype && record.subtype !== query.subtype) { score -= 10; warnings.push('SUBTYPE_FALLBACK'); }

  if (query.size && record.size === query.size) score += 20;
  else if (query.size && record.size !== query.size) { score -= 100; warnings.push('SIZE_FALLBACK'); }

  if (query.branchSize && record.branchSize === query.branchSize) score += 20;
  else if (query.branchSize && record.branchSize !== query.branchSize) { score -= 80; warnings.push('BRANCH_SIZE_FALLBACK'); }

  if (query.rating && record.rating === query.rating) score += 10;
  else if (query.rating && record.rating !== query.rating) { score -= 20; warnings.push('RATING_FALLBACK'); }

  if (query.endType && record.endType === query.endType) score += 5;
  else if (query.endType && record.endType !== query.endType) { score -= 5; warnings.push('ENDTYPE_FALLBACK'); }

  if (query.facing && record.facing === query.facing) score += 5;
  else if (query.facing && record.facing !== query.facing) { score -= 5; warnings.push('FACING_FALLBACK'); }

  if (query.angle && record.angle === query.angle) score += 20;
  else if (query.angle && record.angle !== query.angle) { score -= 50; warnings.push('ANGLE_FALLBACK'); }

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
    const exact = best.warnings.length === 0;
    const result = createResolverResult({
      ok: true,
      source: exact ? 'master-db' : 'fallback',
      matchKey: buildMatchKey(best.record),
      resolved: best.record,
      alternatives: ranked.slice(1, 4).map((row) => row.record),
      warnings: exact ? [] : Array.from(new Set(['FALLBACK_MATCH'].concat(best.warnings))),
    });
    store.setLastResolution(result);
    return result;
  }

  return { resolveComponent };
}
