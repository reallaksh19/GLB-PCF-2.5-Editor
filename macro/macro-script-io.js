import { MACRO_SCRIPT_REPORT_CONTRACT } from './macro-script-report.js';

export const MACRO_SCRIPT_IO_CONTRACT = 'MACRO_SCRIPT_IO_1.0.0';

export function normalizeMacroScriptText(text = '') {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sanitizeFilenamePart(value = '') {
  return String(value || '')
    .trim()
    .replace(/[:/\\?%*"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function macroScriptReportFilename(report = {}, prefix = 'macro-script-report') {
  const rawStamp = report.finishedAt || report.startedAt || new Date().toISOString();
  const stamp = sanitizeFilenamePart(rawStamp) || 'undated';
  const safePrefix = sanitizeFilenamePart(prefix) || 'macro-script-report';

  return `${safePrefix}-${stamp}.json`;
}

export function serializeMacroScriptReport(report = {}, space = 2) {
  const payload = {
    contract: report.contract || MACRO_SCRIPT_REPORT_CONTRACT,
    ...report,
  };

  return JSON.stringify(payload, null, space);
}

export function parseMacroScriptReportJson(jsonText = '') {
  const parsed = JSON.parse(String(jsonText || '{}'));

  if (parsed.contract !== MACRO_SCRIPT_REPORT_CONTRACT) {
    throw new Error(`Invalid macro script report contract: ${parsed.contract || 'missing'}`);
  }

  if (!parsed.summary || typeof parsed.summary !== 'object') {
    throw new Error('Invalid macro script report: missing summary');
  }

  return parsed;
}

export function createMacroScriptDownloadPayload(report = {}, options = {}) {
  return {
    filename: macroScriptReportFilename(report, options.prefix || 'macro-script-report'),
    text: serializeMacroScriptReport(report, options.space ?? 2),
    mime: 'application/json;charset=utf-8',
  };
}

export function buildMacroScriptExample() {
  return [
    '; Example macro script',
    'LINE START=0,0,0 X1000',
    'ROUTES',
    'USE_ROUTE R-1',
    'CURRENT_ROUTE',
    'ROUTE_INFO',
    'ROUTE_DERIVED',
  ].join('\n');
}
