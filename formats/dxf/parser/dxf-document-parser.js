/**
 * formats/dxf/parser/dxf-document-parser.js
 *
 * Primary entrypoint for parsing raw DXF content into an authoritative DxfDocument.
 * Conforms strictly to the Phase 1 specification in Issue #85 and
 * docs/CAD_DOCUMENT_ARCHITECTURE.md.
 */

import { DxfTokenStream } from './dxf-token-stream.js';
import { DxfDocument } from '../model/dxf-document.js';
import {
  parseHeaderSection,
  parseTablesSection,
  parseBlocksSection,
  parseEntitiesSection,
} from './dxf-section-parser.js';

export class DxfDocumentParser {
  /**
   * Parse a raw DXF string into an authoritative DxfDocument.
   *
   * @param {string} dxfText Raw DXF text.
   * @param {Object} [options]
   * @returns {DxfDocument}
   */
  static parse(dxfText, options = {}) {
    if (typeof dxfText !== 'string') {
      throw new TypeError('DxfDocumentParser.parse requires a DXF string');
    }

    const stream = new DxfTokenStream(dxfText);
    const doc = new DxfDocument({
      source: {
        fileName: options.fileName || 'untitled.dxf',
      },
    });

    while (stream.hasNext()) {
      const token = stream.peek();

      if (token.code === 0 && token.value === 'SECTION') {
        stream.next(); // consume 0 SECTION
        let sectionName = 'UNKNOWN';

        if (stream.hasNext() && stream.peek().code === 2) {
          sectionName = stream.next().value.trim().toUpperCase();
        }

        switch (sectionName) {
          case 'HEADER':
            parseHeaderSection(stream, doc);
            break;
          case 'TABLES':
            parseTablesSection(stream, doc);
            break;
          case 'BLOCKS':
            parseBlocksSection(stream, doc);
            break;
          case 'ENTITIES':
            parseEntitiesSection(stream, doc);
            break;
          default: {
            // Passthrough preservation for CLASSES, OBJECTS, and custom sections
            const rawTokens = [
              { code: 0, value: 'SECTION' },
              { code: 2, value: sectionName },
            ];
            while (stream.hasNext()) {
              const cur = stream.next();
              rawTokens.push(cur);
              if (cur.code === 0 && cur.value === 'ENDSEC') {
                break;
              }
            }
            doc.raw.sections.set(sectionName, rawTokens);
            break;
          }
        }
        continue;
      }

      if (token.code === 0 && token.value === 'EOF') {
        stream.next();
        break;
      }

      stream.next();
    }

    return doc;
  }
}
