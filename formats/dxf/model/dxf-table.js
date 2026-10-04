/**
 * formats/dxf/model/dxf-table.js
 *
 * Authoritative DXF Table container (TABLE ... ENDTAB).
 */

export class DxfTableRecord {
  constructor(name, params = {}) {
    this.name = name;
    this.handle = params.handle ? String(params.handle).trim().toUpperCase() : null;
    this.ownerHandle = params.ownerHandle ? String(params.ownerHandle).trim().toUpperCase() : null;
    this.attributes = params.attributes || {};
    this.source = {
      rawTags: Array.isArray(params.source?.rawTags) ? params.source.rawTags : [],
    };
  }
}

export class DxfTable {
  constructor(name, params = {}) {
    this.name = String(name).trim().toUpperCase();
    this.handle = params.handle ? String(params.handle).trim().toUpperCase() : null;
    this.ownerHandle = params.ownerHandle ? String(params.ownerHandle).trim().toUpperCase() : null;
    this.orderedRecords = [];
    this.records = new Map(); // recordName -> DxfTableRecord or specialized class
    this.source = {
      headerRawTags: Array.isArray(params.source?.headerRawTags) ? params.source.headerRawTags : [],
      endTabRawTags: Array.isArray(params.source?.endTabRawTags) ? params.source.endTabRawTags : [],
    };
  }

  addRecord(name, record) {
    this.orderedRecords.push(record);
    const key = String(name).trim().toUpperCase();
    if (!this.records.has(key)) this.records.set(key, record);
  }

  getRecord(name) {
    return this.records.get(String(name).trim().toUpperCase());
  }

  hasRecord(name) {
    return this.records.has(String(name).trim().toUpperCase());
  }

  [Symbol.iterator]() {
    return this.orderedRecords.values();
  }
}
