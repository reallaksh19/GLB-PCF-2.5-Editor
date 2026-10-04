import { DxfTokenStream } from './dxf-token-stream.js';
import { DxfDocument } from '../model/dxf-document.js';
import { indexSource, indexSections } from './dxf-source-index.js';
import { parseHeaderSection, parseTablesSection, parseBlocksSection, parseEntitiesSection } from './dxf-section-parser.js';

/** Preservation-first native parse. No source handle allocation, geometry conversion or CEG. */
export class DxfDocumentParser {
  static parse(input, options = {}) {
    const stream = new DxfTokenStream(input);
    const doc = new DxfDocument({
      id: options.documentId,
      tokenStream: stream,
      source: {
        fileName: options.fileName || 'untitled.dxf',
        acadVersion: stream.acadVersion,
        encoding: stream.encoding,
        declaredCodepage: stream.declaredCodepage,
        newline: stream.newline,
        inputKind: stream.inputKind,
        byteFidelity: stream.inputKind === 'bytes' ? 'exact-input-bytes' : 'provided-utf8-text',
      },
    });
    doc.diagnostics = stream.diagnostics;
    if (stream.binary) return doc;
    indexSource(stream, doc);
    const sections = indexSections(stream, doc);
    const structuralErrors = new Set(['INVALID_GROUP_CODE', 'MISSING_GROUP_VALUE', 'NESTED_SECTION', 'SECTION_NAME_MISSING', 'UNEXPECTED_ENDSEC', 'UNTERMINATED_SECTION', 'EOF_MISSING', 'DATA_AFTER_EOF', 'ORPHAN_TAG']);
    if (doc.diagnostics.some(d => d.severity === 'error' && structuralErrors.has(d.code))) return doc;
    // Semantic-invalid records remain inspectable, but never become editable/savable native documents.
    for (const section of sections) {
      const view = stream.substream(section.bodyStart, section.end);
      if (section.name === 'HEADER') parseHeaderSection(view, doc);
      else if (section.name === 'TABLES') parseTablesSection(view, doc);
      else if (section.name === 'BLOCKS') parseBlocksSection(view, doc);
      else if (section.name === 'ENTITIES') parseEntitiesSection(view, doc);
      else if (section.name === 'OBJECTS' || section.name === 'CLASSES') {
        const target = section.name === 'OBJECTS' ? doc.objects : doc.classes;
        target.push(...doc.raw.records.filter(r => r.span.start > section.span.start && r.span.end <= section.span.end && r.type !== 'ENDSEC'));
      }
    }
    return doc;
  }
}
