/**
 * js/debug/logger.js
 * Structured logger shared by all pipeline stages and the debug tab.
 *
 * Usage:
 *   import { createLogger } from '../debug/logger.js';
 *   const log = createLogger();
 *   log.warn('MISSING_EP1', { id: 'comp_5' });
 *   log.subscribe(entry => console.log(entry));
 *   const all = log.dump();
 */

/**
 * @typedef {'INFO'|'WARN'|'ERROR'} LogLevel
 * @typedef {{ level: LogLevel, code: string, data: object, timestamp: number }} LogEntry
 */

/**
 * Create a new logger instance.
 * @returns {{
 *   info(code:string, data?:object): void,
 *   warn(code:string, data?:object): void,
 *   error(code:string, data?:object): void,
 *   subscribe(fn:(entry:LogEntry)=>void): ()=>void,
 *   clear(): void,
 *   dump(): LogEntry[],
 *   count(level?:LogLevel): number,
 * }}
 */
export function createLogger() {
  /** @type {LogEntry[]} */
  const _entries = [];
  /** @type {Array<(entry:LogEntry)=>void>} */
  const _subs = [];

  function _push(level, code, data = {}) {
    const entry = { level, code, data, timestamp: Date.now() };
    _entries.push(entry);
    _subs.forEach(fn => fn(entry));
  }

  return {
    info:  (code, data) => _push('INFO',  code, data),
    warn:  (code, data) => _push('WARN',  code, data),
    error: (code, data) => _push('ERROR', code, data),

    /**
     * Subscribe to new log entries.
     * @param {(entry:LogEntry)=>void} fn
     * @returns {()=>void} unsubscribe function
     */
    subscribe(fn) {
      _subs.push(fn);
      return () => { const i = _subs.indexOf(fn); if (i !== -1) _subs.splice(i, 1); };
    },

    /** Clear all entries */
    clear() { _entries.length = 0; },

    /** Return a snapshot of all entries */
    dump() { return [..._entries]; },

    /** Count entries, optionally filtered by level */
    count(level) {
      return level ? _entries.filter(e => e.level === level).length : _entries.length;
    },
  };
}

/** Shared application-level logger (imported by tabs and domain plugins) */
export const appLogger = createLogger();
