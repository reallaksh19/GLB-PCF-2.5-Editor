/**
 * core/commands/cad/transform-commands.js
 *
 * Geometric transformation commands for CAD entities:
 * - MoveEntitiesCommand
 * - RotateEntitiesCommand
 * - ScaleEntitiesCommand
 * - CopyEntitiesCommand
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 * Touched source tags stay available to the native byte-overlay writer.
 */

import { CadCommand } from './cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState, cloneNativeValue } from './change-set.js';
import { DxfEntity } from '../../../formats/dxf/model/dxf-entity.js';

function translatePoint(p, dx, dy, dz = 0) {
  if (!p) return;
  p.x = (p.x ?? 0) + dx;
  p.y = (p.y ?? 0) + dy;
  if (dz !== 0 || p.z != null) {
    p.z = (p.z ?? 0) + dz;
  }
}

function rotatePoint(p, center, cos, sin) {
  if (!p) return;
  const rx = (p.x ?? 0) - center.x;
  const ry = (p.y ?? 0) - center.y;
  p.x = center.x + rx * cos - ry * sin;
  p.y = center.y + rx * sin + ry * cos;
}

function scalePoint(p, center, sx, sy, sz = 1) {
  if (!p) return;
  p.x = center.x + ((p.x ?? 0) - center.x) * sx;
  p.y = center.y + ((p.y ?? 0) - center.y) * sy;
  if (p.z != null) {
    p.z = (center.z ?? 0) + ((p.z ?? 0) - (center.z ?? 0)) * sz;
  }
}

function applyTranslation(entity, dx, dy, dz, seen=new Set()) {
  const g = entity.geometry;
  if (!g) return;

  if (g.start && !seen.has(g.start)) {seen.add(g.start); translatePoint(g.start, dx, dy, dz);}
  if (g.end && !seen.has(g.end)) {seen.add(g.end); translatePoint(g.end, dx, dy, dz);}
  if (g.center && !seen.has(g.center)) {seen.add(g.center); translatePoint(g.center, dx, dy, dz);}
  if (g.point && !seen.has(g.point)) {seen.add(g.point); translatePoint(g.point, dx, dy, dz);}
  if (g.insertionPoint && !seen.has(g.insertionPoint)) {seen.add(g.insertionPoint); translatePoint(g.insertionPoint, dx, dy, dz);}
  if (g.alignmentPoint && !seen.has(g.alignmentPoint)) {seen.add(g.alignmentPoint); translatePoint(g.alignmentPoint, dx, dy, dz);}
  if (g.definitionPoint && !seen.has(g.definitionPoint)) {seen.add(g.definitionPoint); translatePoint(g.definitionPoint, dx, dy, dz);}
  if (g.midpoint && !seen.has(g.midpoint)) {seen.add(g.midpoint); translatePoint(g.midpoint, dx, dy, dz);}

  if (Array.isArray(g.vertices)) {
    for (const v of g.vertices) {
      if (v && !seen.has(v)) {seen.add(v); translatePoint(v, dx, dy, dz);}
    }
  }

  if (Array.isArray(g.controlPoints)) {
    for (const cp of g.controlPoints) {
      if (cp && !seen.has(cp)) {seen.add(cp); translatePoint(cp, dx, dy, dz);}
    }
  }

  if (Array.isArray(g.fitPoints)) {
    for (const fp of g.fitPoints) {
      if (fp && !seen.has(fp)) {seen.add(fp); translatePoint(fp, dx, dy, dz);}
    }
  }

  if (Array.isArray(g.corners)) {
    for (const c of g.corners) {
      if (c && !seen.has(c)) {seen.add(c); translatePoint(c, dx, dy, dz);}
    }
  }

  if ((entity.type==='LWPOLYLINE' || (entity.type==='POLYLINE' && !((g.flags || 0)&8))) && g.elevation!=null) g.elevation+=dz;
  // Also translate subEntities if compound entity (e.g. POLYLINE with VERTEX records)
  if (Array.isArray(entity.attributes?.subEntities)) {
    for (const sub of entity.attributes.subEntities) {
      applyTranslation(sub, dx, dy, dz,seen);
    }
  }
}

function applyRotation(entity, center, angleDeg, seen=new Set()) {
  const g = entity.geometry;
  if (!g) return;

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  if (g.start && !seen.has(g.start)) {seen.add(g.start); rotatePoint(g.start, center, cos, sin);}
  if (g.end && !seen.has(g.end)) {seen.add(g.end); rotatePoint(g.end, center, cos, sin);}
  if (g.center && !seen.has(g.center)) {seen.add(g.center); rotatePoint(g.center, center, cos, sin);}
  if (g.point && !seen.has(g.point)) {seen.add(g.point); rotatePoint(g.point, center, cos, sin);}
  if (g.insertionPoint && !seen.has(g.insertionPoint)) {seen.add(g.insertionPoint); rotatePoint(g.insertionPoint, center, cos, sin);}
  if (g.alignmentPoint && !seen.has(g.alignmentPoint)) {seen.add(g.alignmentPoint); rotatePoint(g.alignmentPoint, center, cos, sin);}
  if (g.definitionPoint && !seen.has(g.definitionPoint)) {seen.add(g.definitionPoint); rotatePoint(g.definitionPoint, center, cos, sin);}
  if (g.midpoint && !seen.has(g.midpoint)) {seen.add(g.midpoint); rotatePoint(g.midpoint, center, cos, sin);}

  if (Array.isArray(g.vertices)) {
    for (const v of g.vertices) {
      if (v && !seen.has(v)) {seen.add(v); rotatePoint(v, center, cos, sin);}
    }
  }

  if (Array.isArray(g.controlPoints)) {
    for (const cp of g.controlPoints) {
      if (cp && !seen.has(cp)) {seen.add(cp); rotatePoint(cp, center, cos, sin);}
    }
  }

  if (Array.isArray(g.fitPoints)) {
    for (const fp of g.fitPoints) {
      if (fp && !seen.has(fp)) {seen.add(fp); rotatePoint(fp, center, cos, sin);}
    }
  }

  if (Array.isArray(g.corners)) {
    for (const c of g.corners) {
      if (c && !seen.has(c)) {seen.add(c); rotatePoint(c, center, cos, sin);}
    }
  }

  // Update angles on angle-aware entities
  if (entity.type === 'ARC') {
    if (g.startAngle != null) g.startAngle = (g.startAngle + angleDeg) % 360;
    if (g.endAngle != null) g.endAngle = (g.endAngle + angleDeg) % 360;
  }

  if (entity.type === 'TEXT' || entity.type === 'MTEXT' || entity.type === 'ATTRIB') {
    if (entity.attributes) {
      entity.attributes.rotation = (entity.attributes.rotation || 0) + (entity.type === 'MTEXT' ? rad : angleDeg);
    }
  }

  if (entity.type === 'INSERT') {
    if (g.rotation != null) {
      g.rotation = ((g.rotation || 0) + angleDeg) % 360;
    }
  }

  if (entity.type === 'ELLIPSE' && g.majorAxis) {
    rotatePoint(g.majorAxis, { x: 0, y: 0 }, cos, sin);
  }

  if (Array.isArray(entity.attributes?.subEntities)) {
    for (const sub of entity.attributes.subEntities) {
      applyRotation(sub, center, angleDeg,seen);
    }
  }
}

function applyScaling(entity, center, sx, sy, sz, seen=new Set()) {
  const g = entity.geometry;
  if (!g) return;

  if (g.start && !seen.has(g.start)) {seen.add(g.start); scalePoint(g.start, center, sx, sy, sz);}
  if (g.end && !seen.has(g.end)) {seen.add(g.end); scalePoint(g.end, center, sx, sy, sz);}
  if (g.center && !seen.has(g.center)) {seen.add(g.center); scalePoint(g.center, center, sx, sy, sz);}
  if (g.point && !seen.has(g.point)) {seen.add(g.point); scalePoint(g.point, center, sx, sy, sz);}
  if (g.insertionPoint && !seen.has(g.insertionPoint)) {seen.add(g.insertionPoint); scalePoint(g.insertionPoint, center, sx, sy, sz);}
  if (g.alignmentPoint && !seen.has(g.alignmentPoint)) {seen.add(g.alignmentPoint); scalePoint(g.alignmentPoint, center, sx, sy, sz);}
  if (g.definitionPoint && !seen.has(g.definitionPoint)) {seen.add(g.definitionPoint); scalePoint(g.definitionPoint, center, sx, sy, sz);}
  if (g.midpoint && !seen.has(g.midpoint)) {seen.add(g.midpoint); scalePoint(g.midpoint, center, sx, sy, sz);}

  if (Array.isArray(g.vertices)) {
    for (const v of g.vertices) {
      if (v && !seen.has(v)) {seen.add(v); scalePoint(v, center, sx, sy, sz);}
    }
  }

  if (Array.isArray(g.controlPoints)) {
    for (const cp of g.controlPoints) {
      if (cp && !seen.has(cp)) {seen.add(cp); scalePoint(cp, center, sx, sy, sz);}
    }
  }

  if (Array.isArray(g.fitPoints)) {
    for (const fp of g.fitPoints) {
      if (fp && !seen.has(fp)) {seen.add(fp); scalePoint(fp, center, sx, sy, sz);}
    }
  }

  if (Array.isArray(g.corners)) {
    for (const c of g.corners) {
      if (c && !seen.has(c)) {seen.add(c); scalePoint(c, center, sx, sy, sz);}
    }
  }

  if(g.elevation!=null)g.elevation=(center.z ?? 0)+(g.elevation-(center.z ?? 0))*sz;
  // Dimension scaling
  if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
    if (g.radius != null) g.radius *= avgScale;
  }

  if (entity.type === 'TEXT' || entity.type === 'MTEXT' || entity.type === 'ATTRIB') {
    if (entity.attributes && entity.attributes.height != null) {
      entity.attributes.height *= Math.abs(sy);
    }
  }

  if (entity.type === 'INSERT' && g.scale) {
    g.scale.x = (g.scale.x ?? 1) * sx;
    g.scale.y = (g.scale.y ?? 1) * sy;
    g.scale.z = (g.scale.z ?? 1) * sz;
  }

  if (entity.type === 'ELLIPSE' && g.majorAxis) {
    g.majorAxis.x *= sx;
    g.majorAxis.y *= sy;
    g.majorAxis.z=(g.majorAxis.z ?? 0)*sz;
  }

  if (Array.isArray(entity.attributes?.subEntities)) {
    for (const sub of entity.attributes.subEntities) {
      applyScaling(sub, center, sx, sy, sz,seen);
    }
  }
}

/**
 * Move entities by relative delta (dx, dy, dz).
 */
export class MoveEntitiesCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   * @param {number} dx
   * @param {number} dy
   * @param {number} [dz=0]
   */
  constructor(entityIds, dx, dy, dz = 0) {
    super({ name: 'MOVE', description: `Move ${entityIds.length} entities by (${dx}, ${dy}, ${dz})` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
    this.dx = Number(dx);
    this.dy = Number(dy);
    this.dz = Number(dz);
    this.snapshots = new Map(); // entityId -> snapshot
  }

  execute(document) {
    this.validate(document);
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      applyTranslation(entity, this.dx, this.dy, this.dz);
      entity.markModified();

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
      const before = this.snapshots.get(entity?.id);
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
 * Rotate entities around a base point by an angle in degrees.
 */
export class RotateEntitiesCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   * @param {{ x: number, y: number }} basePoint
   * @param {number} angleDeg
   */
  constructor(entityIds, basePoint, angleDeg) {
    super({ name: 'ROTATE', description: `Rotate ${entityIds.length} entities by ${angleDeg}°` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
    this.basePoint = { x: basePoint?.x ?? 0, y: basePoint?.y ?? 0, z:basePoint?.z ?? 0 };
    this.angleDeg = Number(angleDeg);
    this.snapshots = new Map();
  }

  execute(document) {
    this.validate(document);
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      applyRotation(entity, this.basePoint, this.angleDeg);
      entity.markModified();

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
      const before = this.snapshots.get(entity?.id);
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
 * Scale entities relative to a base point by a scale factor.
 */
export class ScaleEntitiesCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   * @param {{ x: number, y: number }} basePoint
   * @param {number|{ x: number, y: number, z?: number }} scaleFactor
   */
  constructor(entityIds, basePoint, scaleFactor) {
    super({ name: 'SCALE', description: `Scale ${entityIds.length} entities` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
    this.basePoint = { x: basePoint?.x ?? 0, y: basePoint?.y ?? 0, z:basePoint?.z ?? 0 };
    if (typeof scaleFactor === 'number') {
      this.sx = scaleFactor;
      this.sy = scaleFactor;
      this.sz = scaleFactor;
    } else {
      this.sx = scaleFactor?.x ?? 1;
      this.sy = scaleFactor?.y ?? 1;
      this.sz = scaleFactor?.z ?? 1;
    }
    this.snapshots = new Map();
  }

  execute(document) {
    this.validate(document);
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      applyScaling(entity, this.basePoint, this.sx, this.sy, this.sz);
      entity.markModified();

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
      const before = this.snapshots.get(entity?.id);
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
 * Copy entities by relative delta (dx, dy, dz), allocating new handles and IDs.
 */
export class CopyEntitiesCommand extends CadCommand {
  /**
   * @param {Array<string>} sourceEntityIds
   * @param {number} dx
   * @param {number} dy
   * @param {number} [dz=0]
   */
  constructor(sourceEntityIds, dx, dy, dz = 0) {
    super({ name: 'COPY', description: `Copy ${sourceEntityIds.length} entities by (${dx}, ${dy}, ${dz})` });
    this.sourceEntityIds = Array.isArray(sourceEntityIds) ? sourceEntityIds : [sourceEntityIds];
    this.dx = Number(dx);
    this.dy = Number(dy);
    this.dz = Number(dz);
    this.createdEntities = [];
  }

  execute(document) {
    this.validate(document);
    const changeSet = new ChangeSet(this.name);
    if(this.createdEntities.length) {for(const clone of this.createdEntities){document.addEntity(clone);changeSet.addAdded(clone);}this.executed=true;return changeSet;}

    for (const id of this.sourceEntityIds) {
      const src = document.getEntity(id);
      if (!src) continue;

      const clone = new DxfEntity({
        id:document.id+':committed:'+document.handles.handseed,
        handle:document.handles.allocate(),ownerHandle:src.ownerHandle,layoutId:src.layoutId,
        type: src.type,
        layerId: src.layerId,
        space: src.space,
        style: cloneNativeValue(src.style || {}),
        geometry: cloneNativeValue(src.geometry || {}),
        attributes: cloneNativeValue(src.attributes || {}),
        source: {
          order: document.entities.length,
          rawTags: [], // No imported byte span belongs to this created record
        },
        state: {
          modified: true,
          generated: true,
          deleted: false,
        },
      });

      clone.source.copiedRawTags=src.source.rawTags.slice();
      applyTranslation(clone, this.dx, this.dy, this.dz);
      document.addEntity(clone);

      this.createdEntities.push(clone);
      changeSet.addAdded(clone);
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    for (const clone of this.createdEntities) {
      const res = document.removeEntity(clone.id);
      if (res && res.entity) {
        changeSet.addDeleted(res.entity, res.index);
      }
    }

    this.executed = false;
    return changeSet;
  }
}
