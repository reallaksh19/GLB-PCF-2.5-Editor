import { DxfDocumentParser } from '../parser/dxf-document-parser.js';
import { composeBytes } from './dxf-field-overlays.js';
import { resourceOverlays } from './dxf-resource-overlays.js';
import { entityOverlays } from './dxf-structural-overlays.js';
import { serializeNative } from './dxf-serialize.js';

const baselines=new WeakMap();

/** Native byte-backed writer. Unsupported structural changes fail before output delivery. */
export class DxfDocumentWriter {
  static #prepare(doc, options = {}) {
    if (!doc?.tokenStream) throw new TypeError('Native Save requires a byte-backed DxfDocument');
    if (doc.readOnly) throw new Error('Invalid source document: use explicit recoverOriginalBytes, not ordinary Save');
    if (options.newline && options.newline !== doc.source.newline) {
      throw new Error('Unsupported implicit newline conversion; native Save preserves source newlines');
    }
    for (const key of ['encoding', 'acadVersion']) {
      if (options[key] && options[key] !== doc.source[key]) throw new Error('Unsupported implicit ' + key + ' conversion');
    }
    const original = doc.originalBytes;
    let baseline=baselines.get(doc.tokenStream);
    if(!baseline){baseline=DxfDocumentParser.parse(original,{documentId:doc.id,fileName:doc.source.fileName});baselines.set(doc.tokenStream,baseline);}
    if (baseline.readOnly) throw new Error('Invalid original source document; ordinary Save is unavailable');
    const patches = [], newline = doc.source.newline === 'mixed' ? '\n' : (doc.source.newline || '\n');
    const changes=entityOverlays(baseline,doc,newline,patches,validateReferences);
    resourceOverlays(baseline,doc,baseline.tokenStream,newline,patches,changes.created);
    const untouched=baseline.raw.records.filter(r=>!patches.some(p=>(p.start<r.span.end && p.end>r.span.start) || (p.start===p.end && p.start>r.span.start && p.start<r.span.end)))
      .map(r=>original.subarray(r.span.start,r.span.end));
    return {bytes:composeBytes(original, patches),untouched,modifiedSpanCount:patches.length};

  }
  static writeBytes(doc,options={}) { return this.#prepare(doc,options).bytes; }

  // String API is for decoded text consumers; file/download integrations must use writeBytes.
  static write(doc, options = {}) {
    return new TextDecoder(doc?.source?.encoding || 'utf-8').decode(this.writeBytes(doc, options));
  }

  static recoverOriginalBytes(doc) {
    if (!doc?.tokenStream) throw new TypeError('Recovery requires original source bytes');
    return doc.originalBytes;
  }
  static serialize(doc,request) { return serializeNative(doc,request,()=>this.#prepare(doc)); }
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
