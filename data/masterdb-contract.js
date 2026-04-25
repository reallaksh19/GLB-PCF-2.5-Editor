/**
 * data/masterdb-contract.js
 * Master DB visible/internal schema contract for AI-4.
 */
export const MASTERDB_CONTRACT_VERSION = '1.0.0-wave0';

export const REQUIRED_VISIBLE_COLUMNS = Object.freeze(['Component', 'Size', 'Length', 'Weight']);

export function createMasterDbRecord(partial = {}) {
  return {
    id: partial.id || null,
    component: partial.component || '',
    subtype: partial.subtype || null,
    size: partial.size || '',
    rating: partial.rating || null,
    schedule: partial.schedule || null,
    facing: partial.facing || null,
    endType: partial.endType || null,
    length: partial.length ?? null,
    weight: partial.weight ?? null,
    source: partial.source || 'user-masterdb',
    contractVersion: MASTERDB_CONTRACT_VERSION,
  };
}

export function createResolverResult({ ok = false, source = 'manual', matchKey = null, resolved = null, alternatives = [], warnings = [] } = {}) {
  return {
    ok,
    source,
    matchKey,
    resolved,
    alternatives,
    warnings,
    contractVersion: MASTERDB_CONTRACT_VERSION,
  };
}
