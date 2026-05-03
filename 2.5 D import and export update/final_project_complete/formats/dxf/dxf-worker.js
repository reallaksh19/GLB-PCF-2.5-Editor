/*
 * formats/dxf/dxf-worker.js
 *
 * Worker wrapper for DXF parsing.  In a browser environment large
 * DXF files should be parsed in a Web Worker to avoid blocking
 * the UI.  This simplified implementation merely reexports the
 * synchronous parser for Node environments.  Web bundlers can
 * replace this module with an actual worker implementation.
 */

import { parseDxfToRawModel } from './dxf-parser-adapter.js';

/**
 * Parse DXF data in a worker context.  This function is
 * synchronous in Node; browser builds may override it to run
 * parsing off the main thread.  It accepts the same inputs as
 * parseDxfToRawModel and returns a RawDXFModel.
 *
 * @param {string|Buffer} input DXF data or file path.
 * @returns {Object} Raw DXF model.
 */
export function parseDxfInWorker(input) {
  return parseDxfToRawModel(input);
}