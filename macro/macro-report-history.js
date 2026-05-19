import { isMacroReportLike } from './macro-report-io.js';

export const MACRO_REPORT_HISTORY_CONTRACT = 'MACRO_REPORT_HISTORY_1.0.0';
export const DEFAULT_MACRO_REPORT_HISTORY_KEY = 'glb-pcf-editor:macro-report-history:v1';
export const DEFAULT_MACRO_REPORT_HISTORY_LIMIT = 25;

function isoNow(value = null) {
  return value || new Date().toISOString();
}

function sanitizeReportHistoryId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'macro-report';
}

export function macroReportHistoryId(report = {}, now = null) {
  const stamp = isoNow(now)
    .replace(/[:/\\?%*"<>|]/g, '-')
    .replace(/\s+/g, '-');

  const contract = sanitizeReportHistoryId(report.contract || 'macro-report');

  return `${contract}-${stamp}`;
}

export function macroReportHistoryLabel(report = {}, label = '') {
  if (label) return String(label);

  const contract = String(report.contract || 'MACRO_REPORT');
  const ok = report.ok === true ? 'PASS' : 'FAIL';
  const source = report.sourceName || 'macro';
  const stamp = report.finishedAt || report.generatedAt || report.startedAt || '';

  return `${contract} ${ok} ${source}${stamp ? ` @ ${stamp}` : ''}`;
}

export function normalizeMacroReportHistoryEntry(entry = {}, fallbackNow = null) {
  if (!isMacroReportLike(entry.report)) {
    throw new Error('Invalid macro report history entry: missing report contract or summary');
  }

  const createdAt = entry.createdAt || isoNow(fallbackNow);

  return {
    id: sanitizeReportHistoryId(entry.id || macroReportHistoryId(entry.report, createdAt)),
    label: macroReportHistoryLabel(entry.report, entry.label || ''),
    createdAt,
    report: entry.report,
  };
}

export function createMacroReportHistoryEntry(report = {}, label = '', now = null) {
  if (!isMacroReportLike(report)) {
    throw new Error('Invalid macro report: missing contract or summary');
  }

  const createdAt = isoNow(now);

  return normalizeMacroReportHistoryEntry({
    id: macroReportHistoryId(report, createdAt),
    label: macroReportHistoryLabel(report, label),
    createdAt,
    report,
  }, createdAt);
}

export function sortMacroReportHistory(entries = []) {
  return [...(entries || [])]
    .map((entry) => normalizeMacroReportHistoryEntry(entry))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id));
}

export function trimMacroReportHistory(entries = [], limit = DEFAULT_MACRO_REPORT_HISTORY_LIMIT) {
  const max = Math.max(0, Number(limit || DEFAULT_MACRO_REPORT_HISTORY_LIMIT));

  return sortMacroReportHistory(entries).slice(0, max);
}

export function findMacroReportHistoryEntry(entries = [], id = '') {
  const wanted = sanitizeReportHistoryId(id);

  return (entries || []).find((entry) => sanitizeReportHistoryId(entry.id) === wanted) || null;
}

export function addMacroReportHistoryEntry(entries = [], report = {}, options = {}) {
  const entry = createMacroReportHistoryEntry(report, options.label || '', options.now || null);
  const limit = options.limit || DEFAULT_MACRO_REPORT_HISTORY_LIMIT;
  const next = [entry, ...(entries || []).filter((item) => item.id !== entry.id)];

  return {
    entry,
    entries: trimMacroReportHistory(next, limit),
  };
}

export function clearMacroReportHistory() {
  return [];
}

export function serializeMacroReportHistory(entries = [], options = {}) {
  const payload = {
    contract: MACRO_REPORT_HISTORY_CONTRACT,
    exportedAt: options.exportedAt || new Date().toISOString(),
    entries: trimMacroReportHistory(entries, options.limit || DEFAULT_MACRO_REPORT_HISTORY_LIMIT),
  };

  return JSON.stringify(payload, null, options.space ?? 2);
}

export function parseMacroReportHistoryJson(jsonText = '') {
  const parsed = JSON.parse(String(jsonText || '{}'));

  if (parsed.contract !== MACRO_REPORT_HISTORY_CONTRACT) {
    throw new Error(`Invalid macro report history contract: ${parsed.contract || 'missing'}`);
  }

  if (!Array.isArray(parsed.entries)) {
    throw new Error('Invalid macro report history: entries must be an array');
  }

  return sortMacroReportHistory(parsed.entries);
}

export function loadMacroReportHistoryFromStorage(storage, key = DEFAULT_MACRO_REPORT_HISTORY_KEY) {
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }

  const raw = storage.getItem(key);
  if (!raw) return [];

  try {
    return parseMacroReportHistoryJson(raw);
  } catch {
    return [];
  }
}

export function saveMacroReportHistoryToStorage(storage, entries = [], key = DEFAULT_MACRO_REPORT_HISTORY_KEY) {
  const normalized = trimMacroReportHistory(entries);

  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(key, serializeMacroReportHistory(normalized));
  }

  return normalized;
}