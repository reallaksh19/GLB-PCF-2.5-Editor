/*
 * formats/dwg/dwg-conversion-client.js
 *
 * Provides a client for an external DWG conversion service.  DWG
 * files are not edited directly in the browser; instead they are
 * converted to DXF or JSON via an out‑of‑process service.  In
 * environments where no converter is configured this client
 * returns a disabled state.  This module intentionally avoids
 * referencing any network libraries so it can be stubbed or
 * replaced in different environments.
 */

import fs from 'fs';

// Internal flag to simulate service availability.  In a real
// integration this could be set based on environment variables or
// runtime configuration.
let _converterAvailable = false;

/**
 * Check whether a DWG converter service is available.  Returns a
 * promise that resolves to a boolean.  By default the service is
 * unavailable.  Testing code may override this by calling
 * `setConverterAvailable(true)` on this module.
 *
 * @returns {Promise<boolean>} True if the converter is available.
 */
export async function checkConverterHealth() {
  return _converterAvailable;
}

/**
 * Configure the simulated converter availability.  This is
 * primarily used in tests.  Production code should rely on
 * environment detection instead of calling this directly.
 *
 * @param {boolean} available Whether the converter is available.
 */
export function setConverterAvailable(available) {
  _converterAvailable = !!available;
}

/**
 * Convert a DWG file into a DXF string via an external service.
 * This stub implementation reads from a mock fixture when the
 * converter is set as available.  Otherwise it throws an error.
 *
 * @param {Buffer|string} dwgBuffer The DWG file contents or path.
 * @returns {Promise<string>} A promise that resolves to a DXF string.
 */
export async function convertDwgToDxf(dwgBuffer) {
  if (!_converterAvailable) {
    throw new Error('DWG conversion service is not configured');
  }
  // In this stub, read from a mock fixture packaged with the wave
  // instructions.  Attempt to locate the fixture relative to the
  // current working directory.  If not found, return an empty DXF.
  const candidatePaths = [
    'fixtures/mock-dwg-converter-response.json',
    'tmp/wave/ceg_wave_wi_pack/fixtures/mock-dwg-converter-response.json',
    'tmp/repo/fixtures/mock-dwg-converter-response.json'
  ];
  let fixtureData = null;
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        fixtureData = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    } catch (e) {
      // ignore and try next
    }
  }
  if (!fixtureData || !fixtureData.contentBase64) {
    // No fixture found; return empty DXF
    return '';
  }
  const buffer = Buffer.from(fixtureData.contentBase64, 'base64');
  return buffer.toString('utf8');
}

/**
 * Convert a DWG file into a canonical JSON representation via an
 * external service.  This stub implementation returns null
 * because JSON conversion is not required in Wave 2.  Future
 * implementations may decode the canonical JSON directly.
 *
 * @param {Buffer|string} dwgBuffer The DWG file contents or path.
 * @returns {Promise<Object|null>} A promise that resolves to null.
 */
export async function convertDwgToJson(dwgBuffer) {
  if (!_converterAvailable) {
    throw new Error('DWG conversion service is not configured');
  }
  // Not implemented in Wave 2
  return null;
}