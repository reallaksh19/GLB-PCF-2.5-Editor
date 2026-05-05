/**
 * macro/macro-ir-contract.js
 * Macro IR contract for AI-5.
 */
export const MACRO_IR_CONTRACT_VERSION = '1.0.0-wave0';

export function createMacroIR(commands = []) {
  return {
    version: 1,
    contractVersion: MACRO_IR_CONTRACT_VERSION,
    commands,
  };
}

export function validateMacroIR(ir) {
  return !!ir && ir.version === 1 && Array.isArray(ir.commands);
}
