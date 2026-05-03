/*
 * formats/dwg/dwg-conversion-status.js
 *
 * Simple status tracker for DWG conversion operations.  The import
 * panel can display a user‑friendly message depending on the
 * status of the converter.  This module exports constants and a
 * stateful API to get/set the current status.  Only AI‑5 should
 * mutate the status; consumers may read it.
 */

export const DwgConverterStatus = Object.freeze({
  UNAVAILABLE: 'UNAVAILABLE',
  CHECKING: 'CHECKING',
  AVAILABLE: 'AVAILABLE',
  ERROR: 'ERROR'
});

let _status = DwgConverterStatus.UNAVAILABLE;

/**
 * Get the current DWG converter status.
 *
 * @returns {string} One of DwgConverterStatus values.
 */
export function getConverterStatus() {
  return _status;
}

/**
 * Set the current DWG converter status.  Use only in the client
 * implementation or tests.
 *
 * @param {string} status New status value.
 */
export function setConverterStatus(status) {
  if (!Object.values(DwgConverterStatus).includes(status)) {
    throw new Error(`Invalid DWG converter status: ${status}`);
  }
  _status = status;
}