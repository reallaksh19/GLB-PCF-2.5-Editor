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
 * Touched-only rawTags invalidation on mutated entities (Invariant 1).
 */

import { CadCommand } from './cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState } from './change-set.js';
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
    p.z = (p.z ?? 0) * sz;
  }
}

function applyTranslation(entity, dx, dy, dz) {
  const g = entity.geometry;
  if (!g) return;

  translatePoint(g.start, dx, dy, dz);
  translatePoint(g.end, dx, dy, dz);
  translatePoint(g.center, dx, dy, dz);
  translatePoint(g.point, dx, dy, dz);
  translatePoint(g.insertionPoint, dx, dy, dz);
  translatePoint(g.alignmentPoint, dx, dy, dz);
  translatePoint(g.definitionPoint, dx, dy, dz);
  translatePoint(g.midpoint, dx, dy, dz);

  if (Array.isArray(g.vertices)) {
    for (const v of g.vertices) {
      translatePoint(v, dx, dy, dz);
    }
  }

  if (Array.isArray(g.controlPoints)) {
    for (const cp of g.controlPoints) {
      translatePoint(cp, dx, dy, dz);
    }
  }

  if (Array.isArray(g.fitPoints)) {
    for (const fp of g.fitPoints) {
      translatePoint(fp, dx, dy, dz);
    }
  }

  if (Array.isArray(g.corners)) {
    for (const c of g.corners) {
      translatePoint(c, dx, dy, dz);
    }
  }

  // Also translate subEntities if compound entity (e.g. POLYLINE with VERTEX records)
  if (Array.isArray(entity.attributes?.subEntities)) {
    for (const sub of entity.attributes.subEntities) {
      applyTranslation(sub, dx, dy, dz);
    }
  }
}

function applyRotation(entity, center, angleDeg) {
  const g = entity.geometry;
  if (!g) return;

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  rotatePoint(g.start, center, cos, sin);
  rotatePoint(g.end, center, cos, sin);
  rotatePoint(g.center, center, cos, sin);
  rotatePoint(g.point, center, cos, sin);
  rotatePoint(g.insertionPoint, center, cos, sin);
  rotatePoint(g.alignmentPoint, center, cos, sin);
  rotatePoint(g.definitionPoint, center, cos, sin);
  rotatePoint(g.midpoint, center, cos, sin);

  if (Array.isArray(g.vertices)) {
    for (const v of g.vertices) {
      rotatePoint(v, center, cos, sin);
    }
  }

  if (Array.isArray(g.controlPoints)) {
    for (const cp of g.controlPoints) {
      rotatePoint(cp, center, cos, sin);
    }
  }

  if (Array.isArray(g.fitPoints)) {
    for (const fp of g.fitPoints) {
      rotatePoint(fp, center, cos, sin);
    }
  }

  if (Array.isArray(g.corners)) {
    for (const c of g.corners) {
      rotatePoint(c, center, cos, sin);
    }
  }

  // Update angles on angle-aware entities
  if (entity.type === 'ARC') {
    if (g.startAngle != null) g.startAngle = (g.startAngle + angleDeg) % 360;
    if (g.endAngle != null) g.endAngle = (g.endAngle + angleDeg) % 360;
  }

  if (entity.type === 'TEXT' || entity.type === 'MTEXT' || entity.type === 'ATTRIB') {
    if (entity.attributes) {
      entity.attributes.rotation = ((entity.attributes.rotation || 0) + angleDeg) % 360;
    }
  }

  if (entity.type === 'INSERT') {
    if (g.rotation != null) {
      g.rotation = ((g.rotation || 0) + angleDeg) % 360;
    }
  }

  if (entity.type === 'ELLIPSE' && g.majorAxisEndPoint) {
    rotatePoint(g.majorAxisEndPoint, { x: 0, y: 0 }, cos, sin);
  }

  if (Array.isArray(entity.attributes?.subEntities)) {
    for (const sub of entity.attributes.subEntities) {
      applyRotation(sub, center, angleDeg);
    }
  }
}

function applyScaling(entity, center, sx, sy, sz) {
  const g = entity.geometry;
  if (!g) return;

  scalePoint(g.start, center, sx, sy, sz);
  scalePoint(g.end, center, sx, sy, sz);
  scalePoint(g.center, center, sx, sy, sz);
  scalePoint(g.point, center, sx, sy, sz);
  scalePoint(g.insertionPoint, center, sx, sy, sz);
  scalePoint(g.alignmentPoint, center, sx, sy, sz);
  scalePoint(g.definitionPoint, center, sx, sy, sz);
  scalePoint(g.midpoint, center, sx, sy, sz);

  if (Array.isArray(g.vertices)) {
    for (const v of g.vertices) {
      scalePoint(v, center, sx, sy, sz);
    }
  }

  if (Array.isArray(g.controlPoints)) {
    for (const cp of g.controlPoints) {
      scalePoint(cp, center, sx, sy, sz);
    }
  }

  if (Array.isArray(g.fitPoints)) {
    for (const fp of g.fitPoints) {
      scalePoint(fp, center, sx, sy, sz);
    }
  }

  if (Array.isArray(g.corners)) {
    for (const c of g.corners) {
      scalePoint(c, center, sx, sy, sz);
    }
  }

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

  if (entity.type === 'ELLIPSE' && g.majorAxisEndPoint) {
    g.majorAxisEndPoint.x *= sx;
    g.majorAxisEndPoint.y *= sy;
  }

  if (Array.isArray(entity.attributes?.subEntities)) {
    for (const sub of entity.attributes.subEntities) {
      applyScaling(sub, center, sx, sy, sz);
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
    this.dx = Number(dx) || 0;
    this.dy = Number(dy) || 0;
    this.dz = Number(dz) || 0;
    this.snapshots = new Map(); // entityId -> snapshot
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      applyTranslation(entity, this.dx, this.dy, this.dz);
      entity.markModified();
      entity.source.rawTags = null; // Clear raw tags for re-serialization

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
    this.basePoint = { x: basePoint?.x ?? 0, y: basePoint?.y ?? 0 };
    this.angleDeg = Number(angleDeg) || 0;
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

      applyRotation(entity, this.basePoint, this.angleDeg);
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
    this.basePoint = { x: basePoint?.x ?? 0, y: basePoint?.y ?? 0 };
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
    const changeSet = new ChangeSet(this.name);
    this.snapshots.clear();

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const before = snapshotEntityState(entity);
      this.snapshots.set(entity.id, before);

      applyScaling(entity, this.basePoint, this.sx, this.sy, this.sz);
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
    this.dx = Number(dx) || 0;
    this.dy = Number(dy) || 0;
    this.dz = Number(dz) || 0;
    this.createdEntities = [];
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    this.createdEntities = [];

    for (const id of this.sourceEntityIds) {
      const src = document.getEntity(id);
      if (!src) continue;

      const clone = new DxfEntity({
        type: src.type,
        layerId: src.layerId,
        space: src.space,
        style: JSON.parse(JSON.stringify(src.style || {})),
        geometry: JSON.parse(JSON.stringify(src.geometry || {})),
        attributes: JSON.parse(JSON.stringify(src.attributes || {})),
        source: {
          order: document.entities.length,
          rawTags: null, // New entities do not have pre-existing rawTags
        },
        state: {
          modified: true,
          generated: true,
          deleted: false,
        },
      });

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
