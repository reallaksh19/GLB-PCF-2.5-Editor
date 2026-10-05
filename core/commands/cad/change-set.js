/**
 * core/commands/cad/change-set.js
 *
 * Atomic change representation for CAD mutations.
 * Records entities added, modified, and deleted by a command to enable
 * precise undo/redo, incremental render updates, and spatial index reconciliation.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

function deepClone(value,memo=new Map()) {
  if(value===null || typeof value!=='object')return value;
  if(Object.isFrozen(value))return value; // immutable native tokens retain their byte-backed private stream
  if(memo.has(value))return memo.get(value);
  if(value instanceof Uint8Array)return value.slice();
  const out=Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value));memo.set(value,out);
  for(const key of Object.keys(value))out[key]=deepClone(value[key],memo);
  return out;
}
/** A private command before image retains native source spans and compound aliases. */
export function snapshotEntityState(entity) {
  if(!entity)return null;
  return deepClone({type:entity.type,layerId:entity.layerId,space:entity.space,layoutId:entity.layoutId,
    geometry:entity.geometry,style:entity.style,attributes:entity.attributes,source:entity.source,state:entity.state});
}
export function restoreEntityState(entity,snapshot,document=null) {
  if(!entity || !snapshot)return;
  const state=deepClone(snapshot),oldLayer=entity.layerId;
  if(document && oldLayer!==state.layerId) {
    document.layerEntityIndex.get(String(oldLayer).toUpperCase())?.delete(entity.id);
    const key=String(state.layerId).toUpperCase();if(!document.layerEntityIndex.has(key))document.layerEntityIndex.set(key,new Set());
    document.layerEntityIndex.get(key).add(entity.id);
  }
  Object.assign(entity,state);
}

export class ChangeSet {
  /**
   * @param {string} [commandName='CAD_COMMAND']
   */
  constructor(commandName = 'CAD_COMMAND') {
    this.commandName = commandName;
    this.timestamp = Date.now();
    this.added = [];     // Public source identity descriptors only
    this.modified = [];  // Private before images stay on the command
    this.deleted = [];   // No mutable source records
    this.affectedEntityIds = new Set();
  }

  addAdded(entity) {
    if (!entity) return;
    this.added.push({entityId:entity.entityId || entity.id});
    if (entity.entityId || entity.id) this.affectedEntityIds.add(entity.entityId || entity.id);
  }

  addModified(entityId, entity, before, after) {
    const id = entityId || entity?.id;
    if (!id) return;
    this.modified.push({ entityId: id });
    this.affectedEntityIds.add(id);
  }

  addDeleted(entity, originalIndex = -1) {
    if (!entity) return;
    const id = entity.entityId || entity.id;
    this.deleted.push({ entityId: id });
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
    for (const d of other.deleted) this.addDeleted(d);
    return this;
  }
}
