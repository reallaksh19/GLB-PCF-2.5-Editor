import { normalizeHandle } from '../model/dxf-handle-registry.js';
import { parseNumber } from './entity-codecs/codec-utils.js';

export function nativeTags(tags) {
  let depth = 0;
  return tags.filter(t => {
    if (t.code === 102) {
      const value = t.value.trim();
      if (value.startsWith('{')) depth++;
      else if (value === '}') depth = Math.max(0, depth - 1);
      return false;
    }
    return depth === 0 && t.code !== null && t.code < 1000;
  });
}

/** Index all records/resources before allocation or identity adoption, including opaque sections. */
export function indexSource(stream, doc) {
  doc.raw.tokens = stream.tokens;
  let current = null;
  for (const token of stream.tokens) {
    if (token.code === 0) {
      if (current) finish(current, token.start);
      current = { ordinal: doc.raw.records.length, type: token.value.trim().toUpperCase(), rawTags: [token], span: { start: token.start, end: token.end } };
      doc.raw.records.push(current);
    } else if (current) current.rawTags.push(token);
  }
  if (current) finish(current, stream.byteLength);
  const counts = new Map();
  for (const record of doc.raw.records) {
    record.recordId = doc.id + ':record:' + record.ordinal;
    if (!['SECTION', 'ENDSEC', 'EOF'].includes(record.type)) {
      const handleTag = nativeTags(record.rawTags).find(t => t.code === 5 || t.code === 105);
      record.handleLexeme = handleTag?.value ?? null;
      record.handle = handleTag ? normalizeHandle(handleTag.value) : null;
      if (handleTag && record.handle === null) doc.diagnostics.push({ code: 'INVALID_HANDLE', severity: 'error', recordId: record.recordId });
      if (record.handle !== null) {
        counts.set(record.handle, (counts.get(record.handle) || 0) + 1);
        doc.handles.register(record.handle);
      }
    }
    doc.recordByStart.set(record.span.start, record);
    validateNumericFields(record, doc);
  }
  for (const record of doc.raw.records) {
    const unique = record.handle !== null && record.handle !== undefined && counts.get(record.handle) === 1;
    record.id = unique ? doc.id + ':handle:' + record.handle : record.recordId;
    if (record.handle && !unique) doc.diagnostics.push({ code: 'DUPLICATE_HANDLE', severity: 'warning', handle: record.handle, recordId: record.recordId });
  }
  function finish(record, end) { record.span.end = end; }
}

function validateNumericFields(record, doc) {
  for (const t of nativeTags(record.rawTags)) {
    const n = t.code;
    const floating = (n >= 10 && n <= 59) || (n >= 110 && n <= 149) || (n >= 210 && n <= 239) || (n >= 460 && n <= 469);
    const integer = (n >= 60 && n <= 79) || (n >= 90 && n <= 99) || (n >= 160 && n <= 179) || (n >= 270 && n <= 299) || (n >= 370 && n <= 389) || (n >= 400 && n <= 409) || (n >= 420 && n <= 429) || (n >= 440 && n <= 459);
    if ((floating || integer) && !(integer ? /^[+-]?\d+$/.test(t.value.trim()) : Number.isFinite(parseNumber(t.value)))) {
      doc.diagnostics.push({ code: 'INVALID_NUMERIC_VALUE', severity: 'error', line: t.line, groupCode: n, recordOrdinal: record.ordinal });
    }
  }
  if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(record.type) && !nativeTags(record.rawTags).some(t => t.code === 40)) {
    doc.diagnostics.push({ code: 'REQUIRED_TEXT_HEIGHT_MISSING', severity: 'error', recordOrdinal: record.ordinal });
  }
}

/** Section boundaries are retained in order; a lookup map never replaces the preservation inventory. */
export function indexSections(stream, doc) {
  let section = null, sawEof = false;
  const sections = [];
  for (let i = 0; i < stream.tokens.length; i++) {
    const t = stream.tokens[i];
    if (sawEof) {
      doc.diagnostics.push({ code: 'DATA_AFTER_EOF', severity: 'error', line: t.line });
      continue;
    }
    if (t.code !== 0) {
      if (!section && t.code !== 999) doc.diagnostics.push({ code: 'ORPHAN_TAG', severity: 'error', line: t.line });
      continue;
    }
    const value = t.value.trim().toUpperCase();
    if (value === 'SECTION') {
      if (section) doc.diagnostics.push({ code: 'NESTED_SECTION', severity: 'error', line: t.line });
      const name = stream.tokens[i + 1];
      if (name?.code !== 2) doc.diagnostics.push({ code: 'SECTION_NAME_MISSING', severity: 'error', line: t.line });
      section = { name: name?.code === 2 ? name.value.trim().toUpperCase() : 'UNKNOWN', nameLexeme: name?.code === 2 ? name.value : null, start: i, bodyStart: i + (name?.code === 2 ? 2 : 1), span: { start: t.start, end: stream.byteLength } };
    } else if (value === 'ENDSEC') {
      if (!section) doc.diagnostics.push({ code: 'UNEXPECTED_ENDSEC', severity: 'error', line: t.line });
      else {
        section.end = i + 1;
        section.bodyEnd = i;
        section.span.end = t.end;
        section.rawTags = stream.tokens.slice(section.start, section.end);
        sections.push(section);
        if (!doc.raw.sections.has(section.name)) doc.raw.sections.set(section.name, section.rawTags);
        else doc.diagnostics.push({ code: 'REPEATED_SECTION', severity: 'warning', name: section.name });
        section = null;
      }
    } else if (value === 'EOF') {
      if (section) doc.diagnostics.push({ code: 'UNTERMINATED_SECTION', severity: 'error', line: t.line });
      sawEof = true;
    } else if (!section) doc.diagnostics.push({ code: 'RECORD_OUTSIDE_SECTION', severity: 'error', line: t.line });
  }
  if (section) doc.diagnostics.push({ code: 'UNTERMINATED_SECTION', severity: 'error', name: section.name });
  if (!sawEof) doc.diagnostics.push({ code: 'EOF_MISSING', severity: 'error' });
  doc.raw.sectionRecords = sections;
  return sections;
}
