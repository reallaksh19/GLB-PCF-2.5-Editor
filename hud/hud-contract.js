/**
 * hud/hud-contract.js
 * HUD state and trace payload contract for AI-3.
 */
export const HUD_CONTRACT_VERSION = '1.0.0-wave0';

export const initialHudState = {
  contractVersion: HUD_CONTRACT_VERSION,
  visible: false,
  mode: 'idle',
  axisLock: null,
  draft: null,
  preview: null,
  provenance: null,
  errors: [],
};

export function createHudTrace(event, details = {}, ok = true) {
  return {
    scope: 'hud',
    event,
    ok,
    details,
    contractVersion: HUD_CONTRACT_VERSION,
    at: Date.now(),
  };
}
