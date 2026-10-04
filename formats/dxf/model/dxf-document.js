/**
 * formats/dxf/model/dxf-document.js
 *
 * Authoritative DXF Document Model.
 * Represents the complete, un-collapsed CAD drawing structure with full section
 * preservation, tables, block definitions, and stable handle tracking.
 */

import { DxfHandleRegistry } from './dxf-handle-registry.js';
import { DxfTable } from './dxf-table.js';

export class DxfDocument {
  constructor(params = {}) {
    this.source = {
      fileName: params.source?.fileName || 'untitled.dxf',
      acadVersion: params.source?.acadVersion || 'AC1015', // Default AutoCAD 2000
      encoding: params.source?.encoding || 'utf8',
      newline: params.source?.newline || '\r\n',
    };

    this.units = {
      insunits: params.units?.insunits ?? 0, // 0 = Unspecified, 1 = Inches, 4 = Millimeters, 6 = Meters
      measurement: params.units?.measurement ?? 1, // 0 = English, 1 = Metric
      sourceUnit: params.units?.sourceUnit || 'UNSPECIFIED',
      displayUnit: params.units?.displayUnit || 'mm',
    };

    // Header variables map (e.g. $ACADVER -> 'AC1015', $EXTMIN -> {x, y, z})
    this.header = new Map();

    // Classes section records
    this.classes = [];

    // Tables section
    this.tables = {
      layers: new Map(), // layerName (upper) -> DxfLayer
      lineTypes: new DxfTable('LTYPE'),
      textStyles: new DxfTable('STYLE'),
      dimStyles: new DxfTable('DIMSTYLE'),
      appIds: new DxfTable('APPID'),
      blockRecords: new DxfTable('BLOCK_RECORD'),
      viewPorts: new DxfTable('VPORT'),
      ucs: new DxfTable('UCS'),
      other: new Map(), // tableName -> DxfTable
    };

    // Blocks section: blockName (upper) -> DxfBlock
    this.blocks = new Map();

    // Model space & Paper space entities (ordered)
    this.entities = [];

    // Objects section
    this.objects = [];

    // Raw preservation for uninterpreted or passthrough sections
    this.raw = {
      sections: new Map(),
    };

    // Handle allocator and tracker
    this.handles = new DxfHandleRegistry(params.handles?.seed || '1');
  }

  addEntity(entity) {
    if (!entity) return;
    if (entity.handle) {
      this.handles.register(entity.handle);
    } else {
      entity.handle = this.handles.allocate();
      entity.id = `dxf:entity:${entity.handle}`;
    }
    this.entities.push(entity);
  }

  addBlock(block) {
    if (!block || !block.name) return;
    if (block.handle) {
      this.handles.register(block.handle);
    }
    this.blocks.set(block.name.toUpperCase(), block);
  }

  getBlock(name) {
    if (!name) return null;
    return this.blocks.get(String(name).trim().toUpperCase()) || null;
  }

  addLayer(layer) {
    if (!layer || !layer.name) return;
    if (layer.handle) {
      this.handles.register(layer.handle);
    }
    this.tables.layers.set(layer.name.toUpperCase(), layer);
  }

  getLayer(name) {
    if (!name) return null;
    return this.tables.layers.get(String(name).trim().toUpperCase()) || null;
  }
}
