import { MASTERDB_SEED_ROWS, MASTERDB_STORAGE_KEY } from './masterdb-schema.js';
import { normalizeMasterRow, toVisibleRow } from './masterdb-normalize.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function loadRows() {
  try {
    if (typeof localStorage === 'undefined') return MASTERDB_SEED_ROWS.map(normalizeMasterRow);
    const raw = localStorage.getItem(MASTERDB_STORAGE_KEY);
    if (!raw) return MASTERDB_SEED_ROWS.map(normalizeMasterRow);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return MASTERDB_SEED_ROWS.map(normalizeMasterRow);
    return parsed.map(normalizeMasterRow);
  } catch (_) {
    return MASTERDB_SEED_ROWS.map(normalizeMasterRow);
  }
}

function persistRows(rows) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MASTERDB_STORAGE_KEY, JSON.stringify(rows));
  } catch (_) {}
}

export function createMasterDbStore() {
  let state = {
    open: false,
    filterText: '',
    selectedId: null,
    rows: loadRows(),
    dirty: false,
    lastResolution: null,
  };
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) {
      try { fn(state); } catch (_) {}
    }
  }

  function setState(next) {
    state = next;
    notify();
    return state;
  }

  function patch(patch) {
    state = { ...state, ...(patch || {}) };
    notify();
    return state;
  }

  function setRows(rows, { persist = true, dirty = true } = {}) {
    const nextRows = (rows || []).map(normalizeMasterRow);
    state = { ...state, rows: nextRows, dirty, selectedId: state.selectedId && nextRows.some((r) => r.id === state.selectedId) ? state.selectedId : nextRows[0]?.id || null };
    if (persist) persistRows(nextRows);
    notify();
    return state.rows;
  }

  return {
    getState: () => state,
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    open() { patch({ open: true }); },
    close() { patch({ open: false }); },
    patch,
    setFilterText(filterText) { patch({ filterText: String(filterText || '') }); },
    setSelected(id) { patch({ selectedId: id || null }); },
    getRows() { return state.rows || []; },
    getVisibleRows() { return (state.rows || []).map(toVisibleRow); },
    replaceRows(rows, opts) { return setRows(rows, opts); },
    addRow(seed = {}) {
      const row = normalizeMasterRow(seed);
      setRows([...(state.rows || []), row]);
      patch({ selectedId: row.id });
      return row;
    },
    updateRow(id, patchRow = {}) {
      const nextRows = (state.rows || []).map((row) => row.id === id ? normalizeMasterRow({ ...row, ...patchRow, id }) : row);
      setRows(nextRows);
      patch({ selectedId: id });
      return nextRows.find((r) => r.id === id) || null;
    },
    deleteRow(id) {
      const nextRows = (state.rows || []).filter((row) => row.id !== id);
      setRows(nextRows);
      return nextRows;
    },
    resetToSeed() {
      return setRows(MASTERDB_SEED_ROWS, { persist: true, dirty: false });
    },
    setLastResolution(result) {
      patch({ lastResolution: clone(result) });
      return result;
    },
  };
}
