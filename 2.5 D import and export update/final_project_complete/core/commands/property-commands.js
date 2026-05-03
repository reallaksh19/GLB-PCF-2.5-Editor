/*
 * core/commands/property-commands.js
 *
 * Provides property editing commands.  Wave 1 exposes a single
 * `setProperty` operation that mutates a component or anchor using
 * a dotted path.  Additional property‑level commands (e.g. size
 * adjustments, rating changes) may be added in later waves.
 */

export { setProperty } from './geometry-commands.js';