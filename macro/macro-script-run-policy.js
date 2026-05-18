export const MACRO_SCRIPT_RUN_POLICY_CONTRACT = 'MACRO_SCRIPT_RUN_POLICY_1.0.0';

export function normalizeMacroScriptRunOptions(options = {}) {
  return {
    lintBeforeRun: options.lintBeforeRun === true,
    allowRunWithLintErrors: options.allowRunWithLintErrors === true,
    stopOnError: options.stopOnError !== false,
    sourceName: options.sourceName || 'macro-script-run',
  };
}

export function shouldRunMacroScriptAfterLint(lintReport = null, options = {}) {
  const normalized = normalizeMacroScriptRunOptions(options);

  if (!normalized.lintBeforeRun) {
    return {
      ok: true,
      reason: 'lint-not-required',
      lintRequired: false,
      lintOk: null,
      blocked: false,
    };
  }

  if (!lintReport) {
    return {
      ok: false,
      reason: 'missing-lint-report',
      lintRequired: true,
      lintOk: false,
      blocked: true,
    };
  }

  if (lintReport.ok) {
    return {
      ok: true,
      reason: 'lint-passed',
      lintRequired: true,
      lintOk: true,
      blocked: false,
    };
  }

  if (normalized.allowRunWithLintErrors) {
    return {
      ok: true,
      reason: 'lint-failed-but-override-enabled',
      lintRequired: true,
      lintOk: false,
      blocked: false,
    };
  }

  return {
    ok: false,
    reason: 'lint-failed',
    lintRequired: true,
    lintOk: false,
    blocked: true,
  };
}

export function createMacroScriptRunBlockedReport(script = '', lintReport = null, options = {}) {
  const normalized = normalizeMacroScriptRunOptions(options);
  const decision = shouldRunMacroScriptAfterLint(lintReport, normalized);

  return {
    contract: MACRO_SCRIPT_RUN_POLICY_CONTRACT,
    sourceName: normalized.sourceName,
    generatedAt: options.generatedAt || new Date().toISOString(),
    ok: false,
    blocked: true,
    reason: decision.reason,
    script,
    lintReport,
    summary: {
      ok: false,
      blocked: true,
      reason: decision.reason,
      lintOk: decision.lintOk,
      lintErrorCount: lintReport?.errorCount || 0,
      lintWarningCount: lintReport?.warningCount || 0,
    },
  };
}

export function formatMacroScriptRunBlockedSummary(report = {}) {
  const summary = report.summary || {};
  const reason = summary.reason || report.reason || 'unknown';

  return `MACRO_RUN BLOCKED: ${reason}, lintErrors=${summary.lintErrorCount || 0}, lintWarnings=${summary.lintWarningCount || 0}`;
}