import { normalizeMacroScriptText } from './macro-script-io.js';

export const MACRO_SCRIPT_LIBRARY_CONTRACT = 'MACRO_SCRIPT_LIBRARY_1.0.0';
export const DEFAULT_MACRO_SCRIPT_LIBRARY_KEY = 'glb-pcf-editor:macro-script-library:v1';

function isoNow(value = null) {
  return value || new Date().toISOString();
}

export function normalizeMacroScriptName(name = '') {
  const text = String(name || '').trim().replace(/\s+/g, ' ');
  return text || 'Untitled Macro Script';
}

export function sanitizeMacroScriptId(value = '') {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return text || 'macro-script';
}

export function macroScriptIdFromName(name = '') {
  return sanitizeMacroScriptId(normalizeMacroScriptName(name));
}

export function normalizeMacroScriptTag(tag = '') {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeMacroScriptTags(tags = []) {
  const raw = Array.isArray(tags)
    ? tags
    : String(tags || '').split(/[,;]+/);

  const seen = new Set();
  const out = [];

  for (const tag of raw) {
    const normalized = normalizeMacroScriptTag(tag);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    out.push(normalized);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

export function parseMacroScriptTags(value = '') {
  return normalizeMacroScriptTags(value);
}

export function formatMacroScriptTags(tags = []) {
  return normalizeMacroScriptTags(tags).join(', ');
}

export function uniqueMacroScriptId(entries = [], baseId = 'macro-script') {
  const used = new Set((entries || []).map((entry) => entry.id));
  const base = sanitizeMacroScriptId(baseId);

  if (!used.has(base)) return base;

  let idx = 2;
  while (used.has(`${base}-${idx}`)) {
    idx += 1;
  }

  return `${base}-${idx}`;
}

export function normalizeMacroScriptLibraryEntry(entry = {}, fallbackNow = null) {
  const name = normalizeMacroScriptName(entry.name);
  const id = sanitizeMacroScriptId(entry.id || macroScriptIdFromName(name));
  const createdAt = entry.createdAt || isoNow(fallbackNow);
  const updatedAt = entry.updatedAt || createdAt;

  return {
    id,
    name,
    script: normalizeMacroScriptText(entry.script || ''),
    tags: normalizeMacroScriptTags(entry.tags || []),
    createdAt,
    updatedAt,
  };
}

export function createMacroScriptLibraryEntry(input = {}, existingEntries = [], now = null) {
  const name = normalizeMacroScriptName(input.name);
  const baseId = input.id ? sanitizeMacroScriptId(input.id) : macroScriptIdFromName(name);
  const id = input.id ? baseId : uniqueMacroScriptId(existingEntries, baseId);
  const stamp = isoNow(now);

  return normalizeMacroScriptLibraryEntry({
    id,
    name,
    script: input.script || '',
    tags: normalizeMacroScriptTags(input.tags || []),
    createdAt: input.createdAt || stamp,
    updatedAt: input.updatedAt || stamp,
  }, stamp);
}

export function tokenizeMacroScriptLibraryQuery(query = '') {
  return String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function macroScriptLibraryEntrySearchText(entry = {}) {
  const normalized = normalizeMacroScriptLibraryEntry(entry);

  return [
    normalized.id,
    normalized.name,
    normalized.script,
    ...(normalized.tags || []),
  ]
    .join('\n')
    .toLowerCase();
}

export function macroScriptLibraryEntryMatchesQuery(entry = {}, query = '') {
  const tokens = tokenizeMacroScriptLibraryQuery(query);
  if (!tokens.length) return true;

  const haystack = macroScriptLibraryEntrySearchText(entry);

  return tokens.every((token) => haystack.includes(token));
}

export function filterMacroScriptLibrary(entries = [], query = '') {
  return sortMacroScriptLibrary(entries).filter((entry) => macroScriptLibraryEntryMatchesQuery(entry, query));
}

export function collectMacroScriptLibraryTags(entries = []) {
  const tags = new Set();

  for (const entry of entries || []) {
    const normalized = normalizeMacroScriptLibraryEntry(entry);
    for (const tag of normalized.tags || []) {
      tags.add(String(tag).trim());
    }
  }

  return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function formatMacroScriptLibraryOptionLabel(entry = {}) {
  const normalized = normalizeMacroScriptLibraryEntry(entry);
  const tags = normalized.tags?.length ? ` [${normalized.tags.join(', ')}]` : '';

  return `${normalized.name}${tags}`;
}

export function sortMacroScriptLibrary(entries = []) {
  return [...(entries || [])]
    .map((entry) => normalizeMacroScriptLibraryEntry(entry))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function findMacroScriptLibraryEntry(entries = [], id = '') {
  const wanted = sanitizeMacroScriptId(id);

  return (entries || []).find((entry) => sanitizeMacroScriptId(entry.id) === wanted) || null;
}

export function upsertMacroScriptLibraryEntry(entries = [], input = {}, now = null) {
  const current = sortMacroScriptLibrary(entries);
  const requestedId = input.id ? sanitizeMacroScriptId(input.id) : null;
  const existing = requestedId ? findMacroScriptLibraryEntry(current, requestedId) : null;
  const stamp = isoNow(now);

  let entry;

  if (existing) {
    entry = normalizeMacroScriptLibraryEntry({
      ...existing,
      ...input,
      id: existing.id,
      name: normalizeMacroScriptName(input.name || existing.name),
      script: normalizeMacroScriptText(input.script ?? existing.script),
      tags: normalizeMacroScriptTags(input.tags || existing.tags || []),
      createdAt: existing.createdAt,
      updatedAt: stamp,
    }, stamp);
  } else {
    entry = createMacroScriptLibraryEntry(input, current, stamp);
  }

  const next = current.filter((item) => item.id !== entry.id);
  next.push(entry);

  return {
    entry,
    entries: sortMacroScriptLibrary(next),
  };
}

export function updateMacroScriptLibraryEntryMetadata(entries = [], id = '', metadata = {}, now = null) {
  const current = sortMacroScriptLibrary(entries);
  const existing = findMacroScriptLibraryEntry(current, id);

  if (!existing) {
    throw new Error(`Macro script not found: ${id || 'unknown'}`);
  }

  const stamp = isoNow(now);

  const updated = normalizeMacroScriptLibraryEntry({
    ...existing,
    name: metadata.name != null
      ? normalizeMacroScriptName(metadata.name)
      : existing.name,
    tags: metadata.tags != null
      ? normalizeMacroScriptTags(metadata.tags)
      : existing.tags,
    updatedAt: stamp,
  }, stamp);

  const next = current.filter((entry) => entry.id !== existing.id);
  next.push(updated);

  return {
    entry: updated,
    entries: sortMacroScriptLibrary(next),
  };
}

export function removeMacroScriptLibraryEntry(entries = [], id = '') {
  const wanted = sanitizeMacroScriptId(id);
  const removed = findMacroScriptLibraryEntry(entries, wanted);
  const next = sortMacroScriptLibrary((entries || []).filter((entry) => entry.id !== wanted));

  return {
    removed,
    entries: next,
  };
}

export function serializeMacroScriptLibrary(entries = [], options = {}) {
  const payload = {
    contract: MACRO_SCRIPT_LIBRARY_CONTRACT,
    exportedAt: options.exportedAt || new Date().toISOString(),
    entries: sortMacroScriptLibrary(entries),
  };

  return JSON.stringify(payload, null, options.space ?? 2);
}

export function parseMacroScriptLibraryJson(jsonText = '') {
  const parsed = JSON.parse(String(jsonText || '{}'));

  if (parsed.contract !== MACRO_SCRIPT_LIBRARY_CONTRACT) {
    throw new Error(`Invalid macro script library contract: ${parsed.contract || 'missing'}`);
  }

  if (!Array.isArray(parsed.entries)) {
    throw new Error('Invalid macro script library: entries must be an array');
  }

  return sortMacroScriptLibrary(parsed.entries);
}

export function mergeMacroScriptLibraryEntries(existingEntries = [], importedEntries = [], options = {}) {
  const mode = options.mode === 'replace' ? 'replace' : 'merge';
  const now = options.now || null;

  if (mode === 'replace') {
    return {
      mode,
      importedCount: importedEntries.length,
      replacedCount: sortMacroScriptLibrary(existingEntries).length,
      entries: sortMacroScriptLibrary(importedEntries),
    };
  }

  let entries = sortMacroScriptLibrary(existingEntries);
  let replacedCount = 0;
  let addedCount = 0;

  for (const importedRaw of importedEntries || []) {
    const imported = normalizeMacroScriptLibraryEntry(importedRaw, now);
    const existing = findMacroScriptLibraryEntry(entries, imported.id);

    if (existing) {
      replacedCount += 1;
      entries = entries.filter((entry) => entry.id !== existing.id);
      entries.push(normalizeMacroScriptLibraryEntry({
        ...existing,
        ...imported,
        id: existing.id,
        createdAt: existing.createdAt || imported.createdAt,
        updatedAt: now || imported.updatedAt,
      }, now));
    } else {
      addedCount += 1;
      entries.push(imported);
    }
  }

  return {
    mode,
    importedCount: importedEntries.length,
    addedCount,
    replacedCount,
    entries: sortMacroScriptLibrary(entries),
  };
}

export function importMacroScriptLibraryJson(existingEntries = [], jsonText = '', options = {}) {
  const importedEntries = parseMacroScriptLibraryJson(jsonText);
  const result = mergeMacroScriptLibraryEntries(existingEntries, importedEntries, options);

  return {
    ...result,
    importedEntries,
  };
}

export function validateMacroScriptLibraryImportJson(jsonText = '') {
  const entries = parseMacroScriptLibraryJson(jsonText);

  return {
    ok: true,
    count: entries.length,
    entries,
  };
}

export function createMacroScriptLibraryDownloadPayload(entries = [], options = {}) {
  const stamp = String(options.exportedAt || new Date().toISOString())
    .replace(/[:/\\?%*"<>|]/g, '-');

  return {
    filename: `macro-script-library-${stamp}.json`,
    text: serializeMacroScriptLibrary(entries, options),
    mime: 'application/json;charset=utf-8',
  };
}

export function loadMacroScriptLibraryFromStorage(storage, key = DEFAULT_MACRO_SCRIPT_LIBRARY_KEY) {
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }

  const raw = storage.getItem(key);
  if (!raw) return [];

  try {
    return parseMacroScriptLibraryJson(raw);
  } catch {
    return [];
  }
}

export function saveMacroScriptLibraryToStorage(storage, entries = [], key = DEFAULT_MACRO_SCRIPT_LIBRARY_KEY) {
  const normalized = sortMacroScriptLibrary(entries);

  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(key, serializeMacroScriptLibrary(normalized));
  }

  return normalized;
}

export function buildDefaultMacroScriptLibrary(now = null) {
  return [
    createMacroScriptLibraryEntry({
      id: 'example-route-inspection',
      name: 'Example Route Inspection',
      script: [
        '; Example route inspection script',
        'LINE START=0,0,0 X1000',
        'ROUTES',
        'USE_ROUTE R-1',
        'CURRENT_ROUTE',
        'ROUTE_INFO',
        'ROUTE_DERIVED',
      ].join('\n'),
      tags: ['example', 'route'],
    }, [], now),
  ];
}
