import { registerBuiltinCommands, getCommandHandler } from './macro-commands.js';

let _bootstrapped = false;

function ensureBuiltins() {
  if (_bootstrapped) return;
  registerBuiltinCommands();
  _bootstrapped = true;
}

export function registerCommand(name, handler) {
  ensureBuiltins();
  return getCommandHandler.register(name, handler);
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

export function executeMacroScript(script, context) {
  ensureBuiltins();
  const results = [];
  const lines = String(script || '').split(/\r?\n/);
  lines.forEach((line, idx) => {
    const trimmed = stripComments(line).trim();
    if (!trimmed) return;
    try {
      const result = executeMacro(trimmed, context);
      if (result) results.push({ ok: true, line: idx + 1, result });
    } catch (err) {
      results.push({ ok: false, line: idx + 1, error: err });
      throw err;
    }
  });
  return results;
}

export function stripComments(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    if (ch === ';' && !inQuote) return line.slice(0, i);
  }
  return line;
}
