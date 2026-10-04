/**
 * core/commands/cad/change-set.js
 *
 * Atomic change representation for CAD mutations.
 * Records entities added, modified, and deleted by a command to enable
 * precise undo/redo, incremental render updates, and spatial index reconciliation.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

function deepClone(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // Fallback for non-cloneable objects if any
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Capture full state of an entity before modification.
 * @param {import('../../../formats/dxf/model/dxf-entity.js').DxfEntity} entity
 * @returns {Object} snapshot
 */
export function snapshotEntityState(entity) {
  if (!entity) return null;
  return {
    type: entity.type,
    layerId: entity.layerId,
    space: entity.space,
    geometry: deepClone(entity.geometry || {}),
    style: deepClone(entity.style || {}),
    attributes: deepClone(entity.attributes || {}),
    source: {
      order: entity.source?.order ?? 0,
      rawTags: entity.source?.rawTags ? [...entity.source.rawTags] : null,
      seqendRawTags: entity.source?.seqendRawTags ? [...entity.source.seqendRawTags] : null,
    },
    state: {
      modified: Boolean(entity.state?.modified),
      deleted: Boolean(entity.state?.deleted),
      generated: Boolean(entity.state?.generated),
    },
  };
}

/**
 * Revert entity state to pre-modification snapshot.
 * Preserves untouched rawTags invariant when reverted.
 *
 * @param {import('../../../formats/dxf/model/dxf-entity.js').DxfEntity} entity
 * @param {Object} snapshot
 * @param {import('../../../formats/dxf/model/dxf-document.js').DxfDocument} [document]
 */
export function restoreEntityState(entity, snapshot, document = null) {
  if (!entity || !snapshot) return;

  const oldLayer = entity.layerId;
  const targetLayer = snapshot.layerId;

  if (snapshot.type) {
    entity.type = snapshot.type;
  }

  entity.geometry = deepClone(snapshot.geometry || {});
  entity.style = deepClone(snapshot.style || {});
  entity.attributes = deepClone(snapshot.attributes || {});
  entity.space = snapshot.space || 'model';

  entity.source = {
    order: snapshot.source?.order ?? 0,
    rawTags: snapshot.source?.rawTags ? [...snapshot.source.rawTags] : null,
    seqendRawTags: snapshot.source?.seqendRawTags ? [...snapshot.source.seqendRawTags] : null,
  };

  entity.state = {
    modified: Boolean(snapshot.state?.modified),
    deleted: Boolean(snapshot.state?.deleted),
    generated: Boolean(snapshot.state?.generated),
  };

  if (document && oldLayer !== targetLayer) {
    document.moveEntityToLayer(entity, targetLayer);
    // Restore snapshot state and raw tags since moveEntityToLayer marks modified
    entity.state.modified = Boolean(snapshot.state?.modified);
    entity.source.rawTags = snapshot.source?.rawTags ? [...snapshot.source.rawTags] : null;
  } else {
    entity.layerId = targetLayer;
  }
}

export class ChangeSet {
  /**
   * @param {string} [commandName='CAD_COMMAND']
   */
  constructor(commandName = 'CAD_COMMAND') {
    this.commandName = commandName;
    this.timestamp = Date.now();
    this.added = [];     // Array<DxfEntity>
    this.modified = [];  // Array<{ entityId: string, entity: DxfEntity, before: Object, after: Object }>
    this.deleted = [];   // Array<{ entityId: string, entity: DxfEntity, index: number }>
    this.affectedEntityIds = new Set();
  }

  addAdded(entity) {
    if (!entity) return;
    this.added.push(entity);
    if (entity.id) this.affectedEntityIds.add(entity.id);
  }

  addModified(entityId, entity, before, after) {
    const id = entityId || entity?.id;
    if (!id) return;
    this.modified.push({ entityId: id, entity, before, after });
    this.affectedEntityIds.add(id);
  }

  addDeleted(entity, originalIndex = -1) {
    if (!entity) return;
    const id = entity.id;
    this.deleted.push({ entityId: id, entity, index: originalIndex });
    if (id) this.affectedEntityIds.add(id);
  }

  get affectedIds() {
    return Array.from(this.affectedEntityIds);
  }

  hasChanges() {
    return this.added.length > 0 || this.modified.length > 0 || this.deleted.length > 0;
  }

  merge(other) {
    if (!other) return this;
    for (const ent of other.added) this.addAdded(ent);
    for (const m of other.modified) this.addModified(m.entityId, m.entity, m.before, m.after);
    for (const d of other.deleted) this.addDeleted(d.entity, d.index);
    return this;
  }
}
