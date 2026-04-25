import { initialHudState } from './hud-contract.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createHudStore(seed = {}) {
  let state = {
    ...clone(initialHudState),
    ...clone(seed || {}),
  };
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) {
      try { fn(state); } catch (_) {}
    }
  }

  return {
    getState() {
      return state;
    },
    setState(nextState) {
      state = nextState;
      notify();
      return state;
    },
    patch(patch) {
      state = {
        ...state,
        ...(patch || {}),
      };
      notify();
      return state;
    },
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
