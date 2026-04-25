const _entries = [];

export function pushHistory(entry) {
  if (!entry) return;
  _entries.push(entry);
}

export function historyCount() {
  return _entries.length;
}

export function clearHistory() {
  _entries.length = 0;
}

export function undoLast(context) {
  const entry = _entries.pop();
  if (!entry) return { ok: false, message: 'Nothing to undo' };
  if (typeof entry.undo !== 'function') return { ok: false, message: 'Last command is not undoable' };
  entry.undo(context);
  return { ok: true, message: entry.undoMessage || `Undid ${entry.label || 'last command'}` };
}
