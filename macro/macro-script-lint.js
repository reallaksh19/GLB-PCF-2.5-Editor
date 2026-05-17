import { splitMacroScript } from './macro-script-report.js';

export const MACRO_SCRIPT_LINT_CONTRACT = 'MACRO_SCRIPT_LINT_1.0.0';

export function tokenizeMacroLintLine(command = '') {
  const text = String(command || '').trim();
  if (!text) return [];

  const re = /"[^"]*"|\S+/g;

  return [...text.matchAll(re)].map((match) => match[0].replace(/^"|"$/g, ''));
}

export function normalizeMacroCommandName(value = '') {
  return String(value || '').trim().toUpperCase();
}

export function normalizeKnownMacroCommands(commands = []) {
  return new Set((commands || []).map(normalizeMacroCommandName).filter(Boolean));
}

export function createMacroScriptLintIssue(entry = {}, severity = 'error', message = '', details = {}) {
  return {
    severity,
    line: entry.line,
    lineNo: entry.lineNo,
    command: entry.command,
    raw: entry.raw,
    message,
    ...details,
  };
}

export function lintMacroScriptEntries(entries = [], options = {}) {
  const knownCommands = normalizeKnownMacroCommands(options.knownCommands || []);
  const enforceKnownCommands = options.enforceKnownCommands !== false && knownCommands.size > 0;

  const results = [];
  const issues = [];

  for (const entry of entries || []) {
    const tokens = tokenizeMacroLintLine(entry.command);
    const commandName = normalizeMacroCommandName(tokens[0] || '');
    const args = tokens.slice(1);

    const lineResult = {
      ok: true,
      line: entry.line,
      lineNo: entry.lineNo,
      raw: entry.raw,
      command: entry.command,
      commandName,
      args,
      issues: [],
    };

    if (!commandName) {
      const issue = createMacroScriptLintIssue(entry, 'error', 'Empty macro command');
      lineResult.ok = false;
      lineResult.issues.push(issue);
      issues.push(issue);
    } else if (enforceKnownCommands && !knownCommands.has(commandName)) {
      const issue = createMacroScriptLintIssue(
        entry,
        'error',
        `Unknown macro command: ${commandName}`,
        { commandName }
      );
      lineResult.ok = false;
      lineResult.issues.push(issue);
      issues.push(issue);
    }

    results.push(lineResult);
  }

  return { results, issues };
}

export function createMacroScriptLintReport(script = '', options = {}) {
  const entries = splitMacroScript(script);
  const { results, issues } = lintMacroScriptEntries(entries, options);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    contract: MACRO_SCRIPT_LINT_CONTRACT,
    sourceName: options.sourceName || 'macro-script-lint',
    generatedAt: options.generatedAt || new Date().toISOString(),
    ok: errorCount === 0,
    linesTotal: entries.length,
    checkedCount: results.length,
    issueCount: issues.length,
    errorCount,
    warningCount,
    knownCommandCount: normalizeKnownMacroCommands(options.knownCommands || []).size,
    results,
    issues,
    summary: {
      ok: errorCount === 0,
      linesTotal: entries.length,
      checkedCount: results.length,
      issueCount: issues.length,
      errorCount,
      warningCount,
    },
  };
}

export function formatMacroScriptLintSummary(report = {}) {
  const summary = report.summary || {
    ok: Boolean(report.ok),
    checkedCount: report.checkedCount || 0,
    errorCount: report.errorCount || 0,
    warningCount: report.warningCount || 0,
  };

  return `MACRO_LINT ${summary.ok ? 'PASS' : 'FAIL'}: checked=${summary.checkedCount}, errors=${summary.errorCount}, warnings=${summary.warningCount}`;
}