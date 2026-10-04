/**
 * formats/dxf/writer/dxf-document-writer.js
 *
 * Primary entrypoint for serializing an authoritative DxfDocument back to a DXF string.
 * Conforms strictly to Phase 2 specification in Issue #85 and
 * docs/CAD_DOCUMENT_ARCHITECTURE.md.
 */

import { pushTag } from './entity-writers/writer-utils.js';
import {
  writeHeaderSection,
  writeTablesSection,
  writeBlocksSection,
  writeEntitiesSection,
  writeRawSection,
} from './dxf-section-writer.js';

export class DxfDocumentWriter {
  /**
   * Serialize a DxfDocument into a DXF formatted string.
   *
   * @param {DxfDocument} doc Authoritative DXF document.
   * @param {Object} [options]
   * @param {string} [options.newline] Optional newline override ('\r\n' or '\n').
   * @returns {string} Complete DXF file content.
   */
  static write(doc, options = {}) {
    if (!doc || typeof doc !== 'object') {
      throw new TypeError('DxfDocumentWriter.write requires a valid DxfDocument');
    }

    const lines = [];

    // 1. HEADER SECTION
    writeHeaderSection(doc, lines);

    // 2. CLASSES SECTION (if present in preserved sections)
    if (doc.raw?.sections?.has('CLASSES')) {
      writeRawSection(doc.raw.sections.get('CLASSES'), lines);
    }

    // 3. TABLES SECTION
    writeTablesSection(doc, lines);

    // 4. BLOCKS SECTION
    writeBlocksSection(doc, lines);

    // 5. ENTITIES SECTION
    writeEntitiesSection(doc, lines);

    // 6. OBJECTS & OTHER PRESERVED SECTIONS
    if (doc.raw?.sections) {
      for (const [secName, rawTokens] of doc.raw.sections.entries()) {
        if (secName !== 'CLASSES' && secName !== 'HEADER' && secName !== 'TABLES' && secName !== 'BLOCKS' && secName !== 'ENTITIES') {
          writeRawSection(rawTokens, lines);
        }
      }
    }

    // 7. TERMINATING EOF
    pushTag(lines, 0, 'EOF');

    const newline = options.newline || doc.source?.newline || '\r\n';
    return lines.join(newline) + newline;
  }
}
