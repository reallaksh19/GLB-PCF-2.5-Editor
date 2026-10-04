/**
 * core/commands/cad/entity-modify-commands.js
 *
 * Entity Modification Commands:
 * - DeleteEntitiesCommand
 * - ChangeLayerCommand
 * - ChangePropertiesCommand
 * - EditTextCommand
 * - GripEditCommand
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 * Touched-only rawTags invalidation on mutated entities (Invariant 1).
 */

import { CadCommand } from './cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState } from './change-set.js';

/**
 * Delete one or more entities from the document.
 */
export class DeleteEntitiesCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   */
  constructor(entityIds) {
    super({ name: 'DELETE', description: `Delete ${entityIds.length} entities` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
    this.deletedRecords = []; // Array<{ entity, index, snapshot }>
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    this.deletedRecords = [];

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const snapshot = snapshotEntityState(entity);
      const res = document.removeEntity(entity);
      if (res) {
        this.deletedRecords.push({ entity: res.entity, index: res.index, snapshot });
        changeSet.addDeleted(res.entity, res.index);
      }
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    // Restore in original document index order
    this.deletedRecords.sort((a, b) => a.index - b.index);

    for (const rec of this.deletedRecords) {
      restoreEntityState(rec.entity, rec.snapshot, document);
      document.addEntity(rec.entity, rec.index);
      changeSet.addAdded(rec.entity);
    }

    this.executed = false;
    return changeSet;
  }
}

/**
 * Move entities to a different layer.
 */
export class ChangeLayerCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   * @param {string} targetLayer
   */
  constructor(entityIds, targetLayer) {
    super({ name: 'CHANGE_LAYER', description: `Move ${entityIds.length} entities to layer "${targetLayer}"` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
    this.targetLayer = String(targetLayer).trim();
    this.snapshots = new Map();
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      document.moveEntityToLayer(entity, this.targetLayer);
      entity.markModified();
      entity.source.rawTags = null;

      const after = snapshotEntityState(entity);
      changeSet.addModified(entity.id, entity, before, after);
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      const before = this.snapshots.get(id);
      if (!entity || !before) continue;

      const current = snapshotEntityState(entity);
      restoreEntityState(entity, before, document);

      changeSet.addModified(entity.id, entity, current, before);
    }

    this.executed = false;
    return changeSet;
  }
}

/**
 * Modify entity display properties (color, lineType, lineWeight).
 */
export class ChangePropertiesCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   * @param {Object} properties
   * @param {number} [properties.colorIndex]
   * @param {number|null} [properties.trueColor]
   * @param {string} [properties.colorMode]
   * @param {string} [properties.lineType]
   * @param {string} [properties.lineTypeMode]
   * @param {number} [properties.lineWeight]
   * @param {string} [properties.lineWeightMode]
   */
  constructor(entityIds, properties = {}) {
    super({ name: 'CHANGE_PROPERTIES', description: `Change properties for ${entityIds.length} entities` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
    this.properties = properties;
    this.snapshots = new Map();
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      if (this.properties.colorMode != null) entity.style.colorMode = this.properties.colorMode;
      if (this.properties.colorIndex != null) entity.style.colorIndex = this.properties.colorIndex;
      if (this.properties.trueColor !== undefined) entity.style.trueColor = this.properties.trueColor;
      if (this.properties.lineTypeMode != null) entity.style.lineTypeMode = this.properties.lineTypeMode;
      if (this.properties.lineType != null) entity.style.lineType = this.properties.lineType;
      if (this.properties.lineWeightMode != null) entity.style.lineWeightMode = this.properties.lineWeightMode;
      if (this.properties.lineWeight != null) entity.style.lineWeight = this.properties.lineWeight;

      entity.markModified();
      entity.source.rawTags = null;

      const after = snapshotEntityState(entity);
      changeSet.addModified(entity.id, entity, before, after);
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      const before = this.snapshots.get(id);
      if (!entity || !before) continue;

      const current = snapshotEntityState(entity);
      restoreEntityState(entity, before, document);

      changeSet.addModified(entity.id, entity, current, before);
    }

    this.executed = false;
    return changeSet;
  }
}

/**
 * Edit text content or attributes of TEXT / MTEXT / ATTRIB entity.
 */
export class EditTextCommand extends CadCommand {
  /**
   * @param {string} entityId
   * @param {Object} updates
   * @param {string} [updates.text]
   * @param {number} [updates.height]
   * @param {number} [updates.rotation]
   * @param {string} [updates.styleName]
   */
  constructor(entityId, updates = {}) {
    super({ name: 'EDIT_TEXT', description: `Edit text for ${entityId}` });
    this.entityId = entityId;
    this.updates = updates;
    this.beforeSnapshot = null;
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    const entity = document.getEntity(this.entityId);
    if (!entity) return changeSet;

    this.beforeSnapshot = snapshotEntityState(entity);

    if (this.updates.text != null) {
      if (entity.attributes) entity.attributes.text = String(this.updates.text);
    }
    if (this.updates.height != null) {
      if (entity.attributes) entity.attributes.height = Number(this.updates.height);
    }
    if (this.updates.rotation != null) {
      if (entity.attributes) entity.attributes.rotation = Number(this.updates.rotation);
    }
    if (this.updates.styleName != null) {
      if (entity.attributes) entity.attributes.styleName = String(this.updates.styleName);
    }

    entity.markModified();
    entity.source.rawTags = null;

    const after = snapshotEntityState(entity);
    changeSet.addModified(entity.id, entity, this.beforeSnapshot, after);

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);
    const entity = document.getEntity(this.entityId);
    if (!entity || !this.beforeSnapshot) return changeSet;

    const current = snapshotEntityState(entity);
    restoreEntityState(entity, this.beforeSnapshot, document);

    changeSet.addModified(entity.id, entity, current, this.beforeSnapshot);
    this.executed = false;
    return changeSet;
  }
}

/**
 * Grip-edit a specific vertex or control point on an entity.
 */
export class GripEditCommand extends CadCommand {
  /**
   * @param {string} entityId
   * @param {string|number} gripKey - e.g. 0 (start), 1 (end), or vertex index
   * @param {{ x: number, y: number, z?: number }} newPoint
   */
  constructor(entityId, gripKey, newPoint) {
    super({ name: 'GRIP_EDIT', description: `Grip edit ${gripKey} on ${entityId}` });
    this.entityId = entityId;
    this.gripKey = gripKey;
    this.newPoint = { x: newPoint?.x ?? 0, y: newPoint?.y ?? 0, z: newPoint?.z ?? 0 };
    this.beforeSnapshot = null;
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    const entity = document.getEntity(this.entityId);
    if (!entity) return changeSet;

    this.beforeSnapshot = snapshotEntityState(entity);
    const g = entity.geometry;

    if (entity.type === 'LINE') {
      if (this.gripKey === 0 || this.gripKey === 'start') {
        g.start = { ...this.newPoint };
      } else if (this.gripKey === 1 || this.gripKey === 'end') {
        g.end = { ...this.newPoint };
      }
    } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      if (this.gripKey === 0 || this.gripKey === 'center') {
        g.center = { ...this.newPoint };
      } else if (this.gripKey === 'radius' || typeof this.gripKey === 'number') {
        // Adjust radius by distance from center
        const dx = this.newPoint.x - (g.center?.x || 0);
        const dy = this.newPoint.y - (g.center?.y || 0);
        g.radius = Math.sqrt(dx * dx + dy * dy);
      }
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const idx = Number(this.gripKey);
      if (Array.isArray(g.vertices) && idx >= 0 && idx < g.vertices.length) {
        g.vertices[idx].x = this.newPoint.x;
        g.vertices[idx].y = this.newPoint.y;
        if (this.newPoint.z != null && g.vertices[idx].z != null) {
          g.vertices[idx].z = this.newPoint.z;
        }
      }
      if (Array.isArray(entity.attributes?.subEntities) && idx >= 0 && idx < entity.attributes.subEntities.length) {
        const sub = entity.attributes.subEntities[idx];
        if (sub.geometry?.point) {
          sub.geometry.point.x = this.newPoint.x;
          sub.geometry.point.y = this.newPoint.y;
          sub.geometry.point.z = this.newPoint.z;
        }
      }
    } else if (entity.type === 'POINT') {
      g.point = { ...this.newPoint };
    } else if (entity.type === 'TEXT' || entity.type === 'MTEXT' || entity.type === 'INSERT') {
      g.insertionPoint = { ...this.newPoint };
    }

    entity.markModified();
    entity.source.rawTags = null;

    const after = snapshotEntityState(entity);
    changeSet.addModified(entity.id, entity, this.beforeSnapshot, after);

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);
    const entity = document.getEntity(this.entityId);
    if (!entity || !this.beforeSnapshot) return changeSet;

    const current = snapshotEntityState(entity);
    restoreEntityState(entity, this.beforeSnapshot, document);

    changeSet.addModified(entity.id, entity, current, this.beforeSnapshot);
    this.executed = false;
    return changeSet;
  }
}
