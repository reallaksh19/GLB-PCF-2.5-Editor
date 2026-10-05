import { DxfDocumentParser } from '../parser/dxf-document-parser.js';
import { fieldOverlays, composeBytes, same, semantic } from './dxf-field-overlays.js';

/** Native byte-backed writer. Unsupported structural changes fail before output delivery. */
export class DxfDocumentWriter {
  static writeBytes(doc, options = {}) {
    if (!doc?.tokenStream) throw new TypeError('Native Save requires a byte-backed DxfDocument');
    if (doc.readOnly) throw new Error('Invalid source document: use explicit recoverOriginalBytes, not ordinary Save');
    if (options.newline && options.newline !== doc.source.newline) {
      throw new Error('Unsupported implicit newline conversion; native Save preserves source newlines');
    }
    for (const key of ['encoding', 'acadVersion']) {
      if (options[key] && options[key] !== doc.source[key]) throw new Error('Unsupported implicit ' + key + ' conversion');
    }
    const original = doc.originalBytes;
    const baseline = DxfDocumentParser.parse(original, { documentId: doc.id, fileName: doc.source.fileName });
    if (baseline.readOnly) throw new Error('Invalid original source document; ordinary Save is unavailable');
    if (!same(resources(baseline), resources(doc))) throw new Error('Unsupported header/resource mutation requires a committed resource patch plan');
    const patches = [], newline = doc.source.newline === 'mixed' ? '\n' : (doc.source.newline || '\n');
    editList(baseline.entities, doc.entities);
    if (baseline.blockRecords.length !== doc.blockRecords.length) throw new Error('Unsupported BLOCK topology change');
    for (let i = 0; i < baseline.blockRecords.length; i++) editList(baseline.blockRecords[i].entities, doc.blockRecords[i].entities);
    return composeBytes(original, patches);

    function editList(prior, current) {
      if (prior.length !== current.length) throw new Error('Unsupported create/delete requires a committed record/reference closure plan');
      for (let i = 0; i < prior.length; i++) {
        const before = prior[i], after = current[i];
        if (before.source.span?.start !== after.source.span?.start || after.state.deleted || after.state.generated) {
          throw new Error('Unsupported entity topology/identity change');
        }
        if (after.state.modified || !same(before, after)) {
          validateReferences(before, after, doc);
          fieldOverlays(before, after, before.source.rawTags, baseline.tokenStream, newline, patches);
        }
        if (before.type === 'POLYLINE') editPolyline(before, after);
        else editList(before.attributes.attribs || [], after.attributes.attribs || []);
      }
    }
    function editPolyline(before, after) {
      const old = before.geometry.vertices, vertices = after.geometry.vertices;
      const children = before.attributes.subEntities || [], currentChildren = after.attributes.subEntities || [];
      if (old.length !== vertices.length || children.length !== currentChildren.length) throw new Error('Unsupported POLYLINE vertex topology change');
      for (let i = 0; i < old.length; i++) {
        const child = children[i], current = currentChildren[i];
        if (!child || !current || current.state.deleted || current.state.generated) throw new Error('Unsupported VERTEX topology change');
        const synthetic = { ...current, geometry: { ...current.geometry }, attributes: { ...current.attributes } };
        const vertex = vertices[i];
        synthetic.geometry.point = { x: vertex.x, y: vertex.y, z: vertex.z };
        for (const key of ['bulge', 'startWidth', 'endWidth']) synthetic.geometry[key] = vertex[key];
        synthetic.attributes.flags = vertex.flags;
        if (!same(child, current) && !same(current, synthetic)) throw new Error('Unsupported conflicting POLYLINE and VERTEX edits');
        if (after.state.modified || current.state.modified || !same(child, synthetic)) {
          fieldOverlays(child, synthetic, child.source.rawTags, baseline.tokenStream, newline, patches);
        }
      }
    }
  }

  // String API is for decoded text consumers; file/download integrations must use writeBytes.
  static write(doc, options = {}) {
    return new TextDecoder(doc?.source?.encoding || 'utf-8').decode(this.writeBytes(doc, options));
  }

  static recoverOriginalBytes(doc) {
    if (!doc?.tokenStream) throw new TypeError('Recovery requires original source bytes');
    return doc.originalBytes;
  }
}

function validateReferences(before, after, doc) {
  if (before.layerId !== after.layerId && after.layerId !== '0' && !doc.getLayer(after.layerId)) throw new Error('Invalid dangling layer reference');
  if (before.attributes.blockName !== after.attributes.blockName && after.attributes.blockName && !doc.getBlock(after.attributes.blockName)) {
    throw new Error('Invalid dangling block reference');
  }
  if (before.attributes.styleName !== after.attributes.styleName && after.attributes.styleName !== 'STANDARD' &&
      !doc.tables.textStyles.hasRecord(after.attributes.styleName)) throw new Error('Invalid dangling text style reference');
  if (before.style.lineType !== after.style.lineType && !['BYLAYER', 'BYBLOCK', 'CONTINUOUS'].includes(after.style.lineType) &&
      !doc.tables.lineTypes.hasRecord(after.style.lineType)) throw new Error('Invalid dangling line type reference');
}

function resources(doc) {
  const tables = Object.fromEntries(Object.entries(doc.tables).map(([key, value]) => [key, value instanceof Map ? [...value] : value]));
  return semantic({ header: [...doc.header], units: doc.units,
    sourceFormat: [doc.source.acadVersion, doc.source.encoding, doc.source.newline], tables,
    blocks: doc.blockRecords.map(({ entities, ...block }) => block), objects: doc.objects, classes: doc.classes });
}
