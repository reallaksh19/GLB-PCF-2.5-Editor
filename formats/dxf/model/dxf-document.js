import { DxfHandleRegistry } from './dxf-handle-registry.js';
import { DxfTable } from './dxf-table.js';

let nextDocument = 0;
export class DxfDocument {
  constructor(params = {}) {
    this.id = params.id || 'dxf:document:' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + (++nextDocument) + '-' + Math.random().toString(36).slice(2));
    this.source = { fileName: params.source?.fileName || 'untitled.dxf', acadVersion: null, encoding: 'utf-8', newline: null, ...params.source };
    this.units = { insunits: 0, measurement: null, sourceUnit: 'UNSPECIFIED', displayUnit: null, ...params.units };
    this.header = new Map();
    this.classes = [];
    this.tables = {
      layers: new Map(), layerTable: new DxfTable('LAYER'),
      lineTypes: new DxfTable('LTYPE'), textStyles: new DxfTable('STYLE'),
      dimStyles: new DxfTable('DIMSTYLE'), appIds: new DxfTable('APPID'),
      blockRecords: new DxfTable('BLOCK_RECORD'), viewPorts: new DxfTable('VPORT'),
      ucs: new DxfTable('UCS'), other: new Map(),
    };
    this.blocks = new Map();
    this.blockRecords = [];
    this.layerRecords = [];
    this.entities = [];
    this.entityIndex = new Map();
    this.entitiesById = this.entityIndex;
    this.layerEntityIndex = new Map();
    this.modelSpace = [];
    this.paperSpaces = new Map();
    this.objects = [];
    this.raw = { sections: new Map(), sectionRecords: [], records: [], tokens: [] };
    this.recordByStart = new Map();
    this.diagnostics = [];
    this.handles = new DxfHandleRegistry(params.handles?.seed || '1');
    this.tokenStream = params.tokenStream || null;
    this.revision = 0;
    this.contentStateId = this.id + ':content:0';
    this.savedContentStateId = this.contentStateId;
    this.knownContentStates = new Set([this.contentStateId]);
  }
  get originalBytes() { return this.tokenStream?.originalBytes || new Uint8Array(); }
  get readOnly() { return this.diagnostics.some(d => d.severity === 'error'); }
  get dirty() { return this.contentStateId !== this.savedContentStateId; }
  acknowledgeSave(result, delivered = false) {
    if (!delivered) return false;
    if (result.documentId !== this.id || result.outputFormat !== 'dxf' || result.sourceRevision > this.revision ||
        !this.knownContentStates.has(result.sourceContentStateId) || !result.outputDigest) throw new Error('Invalid Save delivery checkpoint');
    this.savedContentStateId = result.sourceContentStateId;
    return true;
  }
  get capabilities() {
    return { preservation: this.source.byteFidelity || 'exact-input-bytes', nativeEditing: false, nativeSave: false, recoveredBytes: true, parseStatus: this.readOnly ? 'incomplete' : 'complete' };
  }
  recordFor(tags) { return tags?.[0] ? this.recordByStart.get(tags[0].start) || null : null; }
  adoptRecord(value, tags) {
    const record = this.recordFor(tags);
    if (record) {
      value.id = record.id;
      value.source.recordId = record.recordId;
      value.source.recordOrdinal = record.ordinal;
      value.source.span = record.span;
      value.source.typeLexeme = record.rawTags[0].value;
      value.source.handleLexeme = record.handleLexeme;
    }
    return record;
  }
  adoptEntity(entity, definitionId = null) {
    if (!entity) return;
    this.adoptRecord(entity, entity.source.rawTags);
    if (!entity.id) entity.id = this.id + ':generated-view:' + this.entityIndex.size;
    entity.documentId = this.id;
    entity.definitionId = definitionId;
    entity.spaceId = definitionId || entity.layoutId || entity.ownerHandle || entity.space;
    this.entityIndex.set(entity.id, entity);
    const children = entity.attributes.subEntities || entity.attributes.attribs || [];
    children.forEach(e => this.adoptEntity(e, definitionId));
    if (entity.type === 'POLYLINE') entity.geometry.vertices.forEach((v, i) => { v.sourceEntityId = children[i]?.id || null; });
    if (entity.source.seqendRawTags) {
      const record = this.recordFor(entity.source.seqendRawTags);
      entity.source.seqendRecordId = record?.recordId || null;
      entity.source.sequenceSpan = { start: entity.source.span.start, end: record?.span.end || entity.source.span.end };
    }
  }
  addEntity(entity) {
    if (!entity) return;
    this.adoptEntity(entity);
    this.entities.push(entity);
    const key=String(entity.layerId || '0').trim().toUpperCase();
    if(!this.layerEntityIndex.has(key)) this.layerEntityIndex.set(key,new Set());
    this.layerEntityIndex.get(key).add(entity.id);
    if (entity.space === 'paper') {
      const key = entity.layoutId || entity.ownerHandle || 'paper';
      if (!this.paperSpaces.has(key)) this.paperSpaces.set(key, []);
      this.paperSpaces.get(key).push(entity);
    } else this.modelSpace.push(entity);
  }
  addBlock(block) {
    if (!block?.name) return;
    this.adoptRecord(block, block.source.headerRawTags);
    this.blockRecords.push(block);
    if (!this.blocks.has(block.name.toUpperCase())) this.blocks.set(block.name.toUpperCase(), block);
    else this.diagnostics.push({ code: 'DUPLICATE_BLOCK_NAME', severity: 'warning', name: block.name });
    block.entities.forEach(e => this.adoptEntity(e, block.id));
  }
  getEntity(idOrHandle) {
    if(this.entityIndex.has(idOrHandle)) return this.entityIndex.get(idOrHandle);
    const handle=String(idOrHandle || '').trim().toUpperCase().replace(/^DXF:ENTITY:/,'');
    const matches=[...this.entityIndex.values()].filter(e=>e.handle===handle);
    return matches.length===1?matches[0]:null;
  }
  getEntityIdsOnLayer(name) { return new Set(this.layerEntityIndex.get(String(name).trim().toUpperCase()) || []); }
  getEntitiesOnLayer(name) { return [...this.getEntityIdsOnLayer(name)].map(id=>this.entityIndex.get(id)).filter(e=>e && !e.state.deleted); }
  getAllLayers() { return [...this.tables.layers.values()]; }
  setLayerVisibility(name,visible) { const l=this.getLayer(name);if(!l)return false;l.setVisible(visible);return true; }
  setLayerFrozen(name,frozen) { const l=this.getLayer(name);if(!l)return false;l.setFrozen(frozen);return true; }
  setLayerLocked(name,locked) { const l=this.getLayer(name);if(!l)return false;l.setLocked(locked);return true; }
  setLayerColor(name,colorIndex,trueColor=null) { const l=this.getLayer(name);if(!l)return false;l.setColor(colorIndex,trueColor);return true; }
  moveEntityToLayer(entityOrId,targetLayer) {
    const e=typeof entityOrId==='string'?this.getEntity(entityOrId):entityOrId;
    if(!e || !this.getLayer(targetLayer))return false;
    this.layerEntityIndex.get(String(e.layerId).toUpperCase())?.delete(e.id);
    e.layerId=targetLayer;e.markModified();
    const key=String(targetLayer).toUpperCase();if(!this.layerEntityIndex.has(key))this.layerEntityIndex.set(key,new Set());
    this.layerEntityIndex.get(key).add(e.id);return true;
  }
  getBlock(name) { return this.blocks.get(String(name ?? '').trim().toUpperCase()) || null; }
  addLayer(layer) {
    if (!layer?.name) return;
    this.adoptRecord(layer, layer.source.rawTags);
    this.layerRecords.push(layer);
    const key = layer.name.toUpperCase();
    if (!this.tables.layers.has(key)) this.tables.layers.set(key, layer);
    else this.diagnostics.push({ code: 'DUPLICATE_LAYER_NAME', severity: 'warning', name: layer.name });
    this.tables.layerTable.addRecord(layer.name, layer);
  }
  getLayer(name) { return this.tables.layers.get(String(name ?? '').trim().toUpperCase()) || null; }
}
