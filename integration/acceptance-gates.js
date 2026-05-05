/**
 * integration/acceptance-gates.js
 * Wave-level acceptance gate contract.
 */
export const ACCEPTANCE_GATE_VERSION = '1.0.0-wave0';

export async function runAcceptance({ unit, playwright, integration }) {
  if (!unit?.ok) throw new Error('Unit suite failed');
  if (!playwright?.ok) throw new Error('Playwright suite failed');
  if (!integration?.ok) throw new Error('Integration suite failed');
  return { ok: true, contractVersion: ACCEPTANCE_GATE_VERSION };
}

export const REQUIRED_BEHAVIOR_GATES = Object.freeze([
  'viewer-load',
  'pick-highlight-sidepanel',
  'route-command-dispatch',
  'shared-draft-parser',
  'vertical-rise-drop',
  'hud-enter-to-commit',
  'resolver-provenance',
  'macro-dry-run-execute',
  'canonical-export',
]);
