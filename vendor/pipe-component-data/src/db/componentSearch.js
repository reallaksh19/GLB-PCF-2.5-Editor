export const SEARCH_MODE = Object.freeze({ EXACT_ALIAS_ONLY: 'EXACT_ALIAS_ONLY' });

export function normalizeSearchText(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[”″]/g, '"')
    .replace(/[^A-Z0-9+".]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchTokens(value) {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

export function expandQueryAliases(query, aliasRows = []) {
  const terms = new Set(searchTokens(query));
  const normalized = normalizeSearchText(query);
  for (const row of aliasList(aliasRows)) {
    const aliases = [row.canonical, ...(row.aliases ?? [])];
    if (aliases.some((alias) => normalized.includes(normalizeSearchText(alias)))) {
      for (const alias of aliases) searchTokens(alias).forEach((term) => terms.add(term));
      searchTokens(row.canonical).forEach((term) => terms.add(term));
    }
  }
  return [...terms];
}

export function componentSearch(query, index, options = {}) {
  const mode = options.mode ?? SEARCH_MODE.EXACT_ALIAS_ONLY;
  if (mode !== SEARCH_MODE.EXACT_ALIAS_ONLY) return rejectedMode(mode);

  const entries = Array.isArray(index?.entries) ? index.entries : [];
  const aliases = aliasList(options.aliases ?? []);
  const filters = cleanFilters(options.filters ?? {});
  const queryForms = exactQueryForms(query, aliases);

  const results = entries
    .filter((entry) => matchesFilters(entry, filters))
    .map((entry) => exactEntryResult(entry, queryForms, filters, aliases))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    ok: results.length > 0,
    mode,
    results,
    diagnostics: results.length ? [] : [{ code: 'SEARCH_NO_EXACT_MATCH' }],
  };
}

export function matchesFilters(entry, filters) {
  return Object.entries(cleanFilters(filters)).every(([key, expected]) => {
    const actual = entry.filters?.[key] ?? entry[key];
    return normalizeSearchText(actual) === normalizeSearchText(expected);
  });
}

function exactEntryResult(entry, queryForms, filters, aliases) {
  const forms = entryExactForms(entry, aliases);
  const aliasMatched = queryForms.some((form) => forms.has(form));
  const filterMatched = hasCompleteFilterMatch(entry, filters);
  if (!aliasMatched && !filterMatched) return null;

  return {
    id: entry.id,
    score: (aliasMatched ? 100 : 0) + (filterMatched ? 50 : 0),
    matched: [aliasMatched && 'exact-alias', filterMatched && 'complete-filter'].filter(Boolean),
    entry,
  };
}

function exactQueryForms(query, aliases) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return exactForms([normalized], aliases);
}

function entryExactForms(entry, aliases) {
  const values = [entry.id, entry.description, ...(entry.aliases ?? [])];
  return new Set(exactForms(values, aliases));
}

function exactForms(values, aliases) {
  const forms = new Set();
  for (const value of values) {
    const normalized = normalizeSearchText(value);
    if (!normalized) continue;
    const conventional = applyEngineeringConventions(normalized);
    forms.add(conventional);
    forms.add(applyAliasConventions(conventional, aliases));
  }
  return [...forms].filter(Boolean);
}

function applyEngineeringConventions(value) {
  return normalizeSearchText(value)
    .replace(/\bCLASS\s*([0-9]+)\b/g, '$1')
    .replace(/\bCL\s*([0-9]+)\b/g, '$1')
    .replace(/\bNPS\s*([0-9.]+)\b/g, '$1')
    .replace(/\bSCHEDULE\s*([0-9A-Z]+)\b/g, 'SCH$1')
    .replace(/\bSCH\s+([0-9A-Z]+)\b/g, 'SCH$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyAliasConventions(value, aliases) {
  let text = ` ${value} `;
  const replacements = [];
  for (const row of aliases) {
    const canonical = applyEngineeringConventions(row.canonical);
    for (const alias of [row.canonical, ...(row.aliases ?? [])]) {
      replacements.push([applyEngineeringConventions(alias), canonical]);
    }
  }
  replacements.sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of replacements) {
    if (!from) continue;
    text = text.replace(new RegExp(`\b${escapeRegExp(from)}\b`, 'g'), to);
  }
  return normalizeSearchText(text);
}

function hasCompleteFilterMatch(entry, filters) {
  const required = Object.keys(entry.filters ?? {});
  if (!required.length) return false;
  return required.every((key) => filters[key] !== undefined && matchesFilters(entry, { [key]: filters[key] }));
}

function cleanFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function aliasList(aliasRows) {
  if (Array.isArray(aliasRows)) return aliasRows;
  if (Array.isArray(aliasRows?.rows)) return aliasRows.rows;
  return [];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rejectedMode(mode) {
  return {
    ok: false,
    mode,
    results: [],
    diagnostics: [{ code: 'SEARCH_MODE_NOT_ALLOWED', mode }],
  };
}
