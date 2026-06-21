import {
  registerBuiltinCommands,
  getCommandHandler,
  listRegisteredCommandNames,
} from './macro-commands.js';
import { registerMacroRouteAutoFitCommands } from './macro-route-auto-fit-commands.js';
import { registerMacroRouteBreakSupportCommands } from './macro-route-break-support-commands.js';
import { registerMacroRouteFlangeCommands } from './macro-route-flange-commands.js';
import {
  appendMacroScriptResult,
  createMacroScriptReport,
  finalizeMacroScriptReport,
  normalizeMacroScriptError,
  splitMacroScript,
  stripMacroComments,
} from './macro-script-report.js';
import { createMacroScriptLintReport } from './macro-script-lint.js';

let _bootstrapped = false;

function ensureBuiltins() {
  if (_bootstrapped) return;
  registerBuiltinCommands();
  registerMacroRouteAutoFitCommands(getCommandHandler.register);
  registerMacroRouteBreakSupportCommands(getCommandHandler.register);
  registerMacroRouteFlangeCommands(getCommandHandler.register);
  _bootstrapped = true;
}

export function registerCommand(name, handler) {
  ensureBuiltins();
  return getCommandHandler.register(name, handler);
}

export function listMacroCommands() {
  ensureBuiltins();
  return listRegisteredCommandNames();
}

export function lintMacroScript(script, options = {}) {
  ensureBuiltins();

  return createMacroScriptLintReport(script, {
    sourceName: options.sourceName || 'macro-engine-lint',
    generatedAt: options.generatedAt,
    knownCommands: options.knownCommands || listRegisteredCommandNames(),
    enforceKnownCommands: options.enforceKnownCommands !== false,
  });
}

export function tokenize(line) {
  const cleaned = stripComments(line).trim();
  if (!cleaned) return [];
  const re = /"[^"]*"|\S+/g;
  return [...cleaned.matchAll(re)].map(m => m[0].replace(/^"|"$/g, ''));
}

export function executeMacro(line, context) {
  ensureBuiltins();
  const tokens = tokenize(line);
  if (!tokens.length) return null;
  const cmd = tokens[0].toUpperCase();
  const handler = getCommandHandler(cmd);
  if (!handler) throw new Error(`Unknown command: ${cmd}`);
  return handler(tokens.slice(1), context || {});
}

export function executeMacroScriptReport(script, context, options = {}) {
  ensureBuiltins();

  const executableLines = splitMacroScript(script);
  const stopOnError = options.stopOnError !== false;
  const throwOnError = options.throwOnError === true;

  const report = createMacroScriptReport({
    sourceName: options.sourceName || 'macro-script',
    stopOnError,
    startedAt: options.startedAt,
  });

  report.linesTotal = executableLines.length;

  for (const entry of executableLines) {
    try {
      const result = executeMacro(entry.command, context || {});
      appendMacroScriptResult(report, {
        ok: true,
        line: entry.line,
        lineNo: entry.lineNo,
        command: entry.command,
        raw: entry.raw,
        result,
      });
    } catch (err) {
      appendMacroScriptResult(report, {
        ok: false,
        line: entry.line,
        lineNo: entry.lineNo,
        command: entry.command,
        raw: entry.raw,
        error: normalizeMacroScriptError(err),
      });

      if (stopOnError) break;
    }
  }

  finalizeMacroScriptReport(report, {
    linesTotal: executableLines.length,
    finishedAt: options.finishedAt,
  });

  if (throwOnError && !report.ok) {
    const firstFailure = report.results.find((item) => !item.ok);
    const err = new Error(firstFailure?.error?.message || 'Macro script failed');
    err.report = report;
    throw err;
  }

  return report;
}

export function executeMacroScript(script, context) {
  const report = executeMacroScriptReport(script, context, {
    stopOnError: true,
    throwOnError: true,
  });

  return report.results;
}

export function stripComments(line) {
  return stripMacroComments(line);
}
