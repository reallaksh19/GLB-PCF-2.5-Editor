/*
 * formats/dwg/dwg-experimental-browser.js
 *
 * Experimental in‑browser DWG import.  Browsers cannot natively
 * parse DWG files; any attempt to do so should be guarded behind
 * a feature flag and produce a clear error until proper support
 * is implemented.  This stub exposes a disabled import function
 * that always rejects.  Enabling this import requires linking
 * against a DWG parser compiled to WebAssembly (e.g. LibreDWG)
 * and is outside the scope of Wave 2.
 */

/**
 * Attempt to parse a DWG buffer directly in the browser.  This
 * function is disabled by default and will reject.  It is
 * intentionally separated from the conversion client so that
 * future versions can conditionally enable browser parsing when
 * a WASM parser is available.
 *
 * @param {ArrayBuffer|Uint8Array} buffer The DWG file data.
 * @returns {Promise<never>} Always rejects with a clear message.
 */
export async function experimentalParseDwg(buffer) {
  throw new Error('Browser DWG parsing is not supported in this build');
}