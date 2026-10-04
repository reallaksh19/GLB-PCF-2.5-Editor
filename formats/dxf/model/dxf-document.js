/**
 * formats/dxf/model/dxf-document.js
 *
 * Authoritative DXF Document Model.
 * Represents the complete, un-collapsed CAD drawing structure with full section
 * preservation, tables, block definitions, and stable handle tracking.
 */

import { DxfHandleRegistry } from './dxf-handle-registry.js';
import { DxfTable } from './dxf-table.js';
import { DxfLayer } from './dxf-layer.js';

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

    // Fast lookup indices
    this.entitiesById = new Map(); // id ('dxf:entity:1A') -> DxfEntity
    this.layerEntityIndex = new Map(); // layerName (upper) -> Set<string> of entity IDs
  }

  addEntity(entity, insertIndex = -1) {
    if (!entity) return;
    if (entity.handle) {
      this.handles.register(entity.handle);
    } else {
      entity.handle = this.handles.allocate();
      entity.id = `dxf:entity:${entity.handle}`;
    }

    if (entity.state) {
      entity.state.deleted = false;
    }

    if (insertIndex >= 0 && insertIndex < this.entities.length) {
      this.entities.splice(insertIndex, 0, entity);
    } else {
      this.entities.push(entity);
    }

    // Maintain indices
    if (entity.id) {
      this.entitiesById.set(entity.id, entity);
    }
    const layerKey = String(entity.layerId || '0').trim().toUpperCase();
    let layerSet = this.layerEntityIndex.get(layerKey);
    if (!layerSet) {
      layerSet = new Set();
      this.layerEntityIndex.set(layerKey, layerSet);
    }
    if (entity.id) {
      layerSet.add(entity.id);
    }
  }

  removeEntity(idOrHandle) {
    const ent = typeof idOrHandle === 'string' ? this.getEntity(idOrHandle) : idOrHandle;
    if (!ent) return null;

    const idx = this.entities.indexOf(ent);
    if (idx !== -1) {
      this.entities.splice(idx, 1);
    }

    if (ent.id) {
      this.entitiesById.delete(ent.id);
    }
    const layerKey = String(ent.layerId || '0').trim().toUpperCase();
    const layerSet = this.layerEntityIndex.get(layerKey);
    if (layerSet && ent.id) {
      layerSet.delete(ent.id);
    }

    ent.markDeleted();
    return { entity: ent, index: idx };
  }

  getEntity(idOrHandle) {
    if (!idOrHandle) return null;
    const str = String(idOrHandle).trim();
    const id = str.startsWith('dxf:entity:') ? str : `dxf:entity:${str.toUpperCase()}`;
    return this.entitiesById.get(id) || null;
  }

  getEntityIdsOnLayer(layerName) {
    if (!layerName) return new Set();
    const key = String(layerName).trim().toUpperCase();
    return this.layerEntityIndex.get(key) || new Set();
  }

  getEntitiesOnLayer(layerName) {
    const ids = this.getEntityIdsOnLayer(layerName);
    const result = [];
    for (const id of ids) {
      const ent = this.entitiesById.get(id);
      if (ent) result.push(ent);
    }
    return result;
  }

  getAllLayers() {
    return Array.from(this.tables.layers.values());
  }

  setLayerVisibility(layerName, visible) {
    const layer = this.getLayer(layerName);
    if (!layer) return false;
    layer.setVisible(visible);
    return true;
  }

  setLayerFrozen(layerName, frozen) {
    const layer = this.getLayer(layerName);
    if (!layer) return false;
    layer.setFrozen(frozen);
    return true;
  }

  setLayerLocked(layerName, locked) {
    const layer = this.getLayer(layerName);
    if (!layer) return false;
    layer.setLocked(locked);
    return true;
  }

  setLayerColor(layerName, colorIndex, trueColor = null) {
    const layer = this.getLayer(layerName);
    if (!layer) return false;
    layer.setColor(colorIndex, trueColor);
    return true;
  }

  moveEntityToLayer(entityOrId, targetLayerName) {
    const ent = typeof entityOrId === 'string' ? this.getEntity(entityOrId) : entityOrId;
    if (!ent || !targetLayerName) return false;

    const oldLayerKey = String(ent.layerId || '0').trim().toUpperCase();
    const newLayerKey = String(targetLayerName).trim().toUpperCase();

    // Remove from old layer index
    const oldSet = this.layerEntityIndex.get(oldLayerKey);
    if (oldSet && ent.id) {
      oldSet.delete(ent.id);
    }

    // Update entity
    ent.layerId = targetLayerName;
    ent.markModified();

    // Add to new layer index
    let newSet = this.layerEntityIndex.get(newLayerKey);
    if (!newSet) {
      newSet = new Set();
      this.layerEntityIndex.set(newLayerKey, newSet);
    }
    if (ent.id) {
      newSet.add(ent.id);
    }

    // Ensure layer exists in tables
    if (!this.getLayer(targetLayerName)) {
      this.addLayer(new DxfLayer({ name: targetLayerName }));
    }

    return true;
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
