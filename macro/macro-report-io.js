export const MACRO_REPORT_IO_CONTRACT = 'MACRO_REPORT_IO_1.0.0';

export const KNOWN_MACRO_REPORT_CONTRACTS = [
  'MACRO_SCRIPT_REPORT_1.0.0',
  'MACRO_SCRIPT_LINT_1.0.0',
  'MACRO_SCRIPT_RUN_POLICY_1.0.0',
];

function sanitizeFilenamePart(value = '') {
  return String(value || '')
    .trim()
    .replace(/[:/\\?%*"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeMacroReportPrefix(prefix = 'macro-report') {
  return sanitizeFilenamePart(prefix) || 'macro-report';
}

export function isMacroReportLike(report = {}) {
  return Boolean(report && typeof report === 'object' && report.contract && report.summary);
}

export function macroReportTimestamp(report = {}) {
  return (
    report.finishedAt ||
    report.generatedAt ||
    report.startedAt ||
    new Date().toISOString()
  );
}

export function macroReportFilename(report = {}, prefix = 'macro-report') {
  const safePrefix = normalizeMacroReportPrefix(prefix);
  const stamp = sanitizeFilenamePart(macroReportTimestamp(report)) || 'undated';

  return `${safePrefix}-${stamp}.json`;
}

export function serializeMacroReport(report = {}, space = 2) {
  if (!isMacroReportLike(report)) {
    throw new Error('Invalid macro report: missing contract or summary');
  }

  return JSON.stringify(report, null, space);
}

export function parseMacroReportJson(jsonText = '', allowedContracts = KNOWN_MACRO_REPORT_CONTRACTS) {
  const parsed = JSON.parse(String(jsonText || '{}'));

  if (!isMacroReportLike(parsed)) {
    throw new Error('Invalid macro report: missing contract or summary');
  }

  const allowed = Array.isArray(allowedContracts) ? allowedContracts : [];

  if (allowed.length && !allowed.includes(parsed.contract)) {
    throw new Error(`Unsupported macro report contract: ${parsed.contract}`);
  }

  return parsed;
}

export function createMacroReportDownloadPayload(report = {}, options = {}) {
  return {
    filename: macroReportFilename(report, options.prefix || 'macro-report'),
    text: serializeMacroReport(report, options.space ?? 2),
    mime: 'application/json;charset=utf-8',
    contract: MACRO_REPORT_IO_CONTRACT,
  };
}