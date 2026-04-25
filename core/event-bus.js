/**
 * event-bus.js — Minimal pub/sub for inter-module communication.
 *
 * Events used by the app:
 *   'model-loaded'       — { components, domain, sourceName?, sourceType?, loadedAt? }
 *   'component-selected' — { comp, mesh }
 */

const listeners = {};

export function on(event, fn) {
  (listeners[event] ??= []).push(fn);
}

export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

export function emit(event, payload) {
  (listeners[event] ?? []).forEach(fn => fn(payload));
}


/** Wave 0 contract baseline event names. */
export const EVENT_NAMES = Object.freeze({
  MODEL_LOADED: 'model-loaded',
  COMPONENT_SELECTED: 'component-selected',
  DEBUG_TRACE: 'debug:trace',
});

export function once(event, fn) {
  const wrapper = (payload) => {
    off(event, wrapper);
    fn(payload);
  };
  on(event, wrapper);
}
