/*
 * ui/import-panel/dwg-import-status.js
 *
 * UI helper for displaying DWG conversion status messages.  In the
 * absence of a configured DWG converter the import panel uses
 * this module to present a consistent message to the user.  It
 * exports a single function that returns the appropriate message
 * based on converter availability.  Because this project does not
 * include a full UI framework, the helper simply returns strings.
 */

import { checkConverterHealth } from '../../formats/dwg/dwg-conversion-client.js';

/**
 * Get a user‑friendly message describing the state of the DWG
 * conversion service.  When the converter is unavailable the
 * message instructs the user to convert DWG files to DXF before
 * importing.  When available, an empty string is returned since
 * no special message is needed.
 *
 * @returns {Promise<string>} A promise that resolves to a message.
 */
export async function getDwgImportStatusMessage() {
  const available = await checkConverterHealth();
  if (!available) {
    return 'DWG conversion service is not configured. Please convert DWG to DXF and import the DXF file.';
  }
  return '';
}