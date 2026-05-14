export const MACRO_SCRIPT_REPORT_CONTRACT = 'MACRO_SCRIPT_REPORT_1.0.0';

export function stripMacroComments(line = '') {
  let inQuote = false;
  const text = String(line || '');

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      inQuote = !inQuote;
    }

    if (ch === ';' && !inQuote) {
      return text.slice(0, i);
    }
  }

  return text;
}

export function splitMacroScript(script = '') {
  return String(script || '')
    .split(/\r?\n/)
    .map((raw, idx) => {
      const command = stripMacroComments(raw).trim();

      return {
        line: idx + 1,
        lineNo: idx + 1,
        raw,
        command,
      };
    })
    .filter((entry) => entry.command.length > 0);
}

export function normalizeMacroScriptError(err) {
  return {
    name: err?.name || 'Error',
    message: String(err?.message || err),
  };
}

export function createMacroScriptReport(options = {}) {
  const startedAt = options.startedAt || new Date().toISOString();

  return {
    contract: MACRO_SCRIPT_REPORT_CONTRACT,
    sourceName: options.sourceName || 'macro-script',
    startedAt,
    finishedAt: null,
    stopOnError: options.stopOnError !== false,
    ok: null,
    linesTotal: 0,
    executedCount: 0,
    successCount: 0,
    failureCount: 0,
    results: [],
    summary: null,
  };
}

export function appendMacroScriptResult(report, entry) {
  if (!report || !entry) return report;

  report.results.push(entry);
  report.executedCount += 1;

  if (entry.ok) {
    report.successCount += 1;
  } else {
    report.failureCount += 1;
  }

  return report;
}

export function finalizeMacroScriptReport(report, options = {}) {
  if (!report) return report;

  report.finishedAt = options.finishedAt || new Date().toISOString();
  report.linesTotal = Number(options.linesTotal || report.linesTotal || report.results.length);
  report.ok = report.failureCount === 0;
  report.summary = {
    ok: report.ok,
    linesTotal: report.linesTotal,
    executedCount: report.executedCount,
    successCount: report.successCount,
    failureCount: report.failureCount,
    stoppedOnError: Boolean(report.failureCount > 0 && report.stopOnError),
  };

  return report;
}

export function formatMacroScriptSummary(report = {}) {
  const summary = report.summary || {
    ok: Boolean(report.ok),
    executedCount: report.executedCount || 0,
    successCount: report.successCount || 0,
    failureCount: report.failureCount || 0,
  };

  return `MACRO_SCRIPT ${summary.ok ? 'PASS' : 'FAIL'}: executed=${summary.executedCount}, success=${summary.successCount}, failed=${summary.failureCount}`;
}
