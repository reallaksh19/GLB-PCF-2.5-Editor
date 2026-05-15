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
    tags: Array.isArray(entry.tags) ? entry.tags.map(String).filter(Boolean) : [],
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
    tags: input.tags || [],
    createdAt: input.createdAt || stamp,
    updatedAt: input.updatedAt || stamp,
  }, stamp);
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
      tags: input.tags || existing.tags || [],
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
