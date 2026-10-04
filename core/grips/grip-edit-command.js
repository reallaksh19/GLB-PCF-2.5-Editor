/**
 * core/grips/grip-edit-command.js
 *
 * Command executing interactive grip modifications (stretch, move, resize).
 * Encapsulates transactional mutations with full undo/redo and ChangeSet tracking.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { CadCommand } from '../commands/cad/cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState } from '../commands/cad/change-set.js';
import { GripRole } from './grip-point.js';
import { normalizeAngle } from '../geometry/cad-intersections.js';

export class GripEditCommand extends CadCommand {
  /**
   * @param {Object} params
   * @param {string} params.entityId ID / handle of entity being manipulated
   * @param {import('./grip-point.js').GripPoint|Object} params.grip Grip definition
   * @param {{x: number, y: number, z?: number}} params.newPosition Target coordinate
   * @param {{x: number, y: number, z?: number}} [params.basePosition] Reference coordinate (default grip.point)
   */
  constructor({ entityId, grip, newPosition, basePosition = null }) {
    super({
      name: `GRIP_EDIT_${grip?.role ?? 'FEATURE'}`,
      description: `Grip edit ${grip?.role} on entity ${entityId}`,
    });

    if (!entityId) throw new Error('GripEditCommand requires entityId');
    if (!grip) throw new Error('GripEditCommand requires grip');
    if (!newPosition || typeof newPosition.x !== 'number' || typeof newPosition.y !== 'number') {
      throw new Error('GripEditCommand requires valid newPosition {x, y}');
    }

    this.entityId = entityId;
    this.grip = grip;
    this.newPosition = {
      x: Number(newPosition.x),
      y: Number(newPosition.y),
      z: Number(newPosition.z ?? 0),
    };
    const base = basePosition || grip.point || newPosition;
    this.basePosition = {
      x: Number(base.x),
      y: Number(base.y),
      z: Number(base.z ?? 0),
    };

    this.preSnapshot = null;
  }

  execute(document) {
    const entity = (typeof document.getEntity === 'function' ? document.getEntity(this.entityId) : null)
      || document.entitiesById?.get(this.entityId)
      || (Array.isArray(document.entities) ? document.entities.find((e) => e.id === this.entityId || e.handle === this.entityId) : null);
    if (!entity || !entity.geometry) {
      throw new Error(`Entity not found or has no geometry: ${this.entityId}`);
    }

    // 1. Snapshot prior state
    this.preSnapshot = snapshotEntityState(entity);

    const dx = this.newPosition.x - this.basePosition.x;
    const dy = this.newPosition.y - this.basePosition.y;
    const dz = this.newPosition.z - this.basePosition.z;

    const g = entity.geometry;
    const role = this.grip.role;

    // 2. Apply grip modification based on entity type and grip role
    switch (entity.type) {
      case 'LINE': {
        if (role === GripRole.START) {
          g.start = { x: this.newPosition.x, y: this.newPosition.y, z: this.newPosition.z };
        } else if (role === GripRole.END) {
          g.end = { x: this.newPosition.x, y: this.newPosition.y, z: this.newPosition.z };
        } else if (role === GripRole.MID) {
          g.start = { x: (g.start?.x ?? 0) + dx, y: (g.start?.y ?? 0) + dy, z: (g.start?.z ?? 0) + dz };
          g.end = { x: (g.end?.x ?? 0) + dx, y: (g.end?.y ?? 0) + dy, z: (g.end?.z ?? 0) + dz };
        }
        break;
      }

      case 'CIRCLE': {
        if (role === GripRole.CENTER) {
          g.center = { x: this.newPosition.x, y: this.newPosition.y, z: this.newPosition.z };
        } else if (role === GripRole.QUADRANT) {
          const c = g.center || { x: 0, y: 0 };
          const dist = Math.sqrt(
            Math.pow(this.newPosition.x - c.x, 2) + Math.pow(this.newPosition.y - c.y, 2)
          );
          if (dist > 1e-6) {
            g.radius = dist;
          }
        }
        break;
      }

      case 'ARC': {
        const c = g.center || { x: 0, y: 0 };
        if (role === GripRole.CENTER) {
          g.center = { x: this.newPosition.x, y: this.newPosition.y, z: this.newPosition.z };
        } else if (role === GripRole.START) {
          const ang = (Math.atan2(this.newPosition.y - c.y, this.newPosition.x - c.x) * 180) / Math.PI;
          g.startAngle = normalizeAngle(ang);
        } else if (role === GripRole.END) {
          const ang = (Math.atan2(this.newPosition.y - c.y, this.newPosition.x - c.x) * 180) / Math.PI;
          g.endAngle = normalizeAngle(ang);
        } else if (role === GripRole.MID) {
          const dist = Math.sqrt(
            Math.pow(this.newPosition.x - c.x, 2) + Math.pow(this.newPosition.y - c.y, 2)
          );
          if (dist > 1e-6) {
            g.radius = dist;
          }
        }
        break;
      }

      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vertices = g.vertices || [];
        const vIdx = this.grip.vertexIndex;

        if (role === GripRole.VERTEX && vIdx != null && vIdx >= 0 && vIdx < vertices.length) {
          const v = vertices[vIdx];
          v.x = this.newPosition.x;
          v.y = this.newPosition.y;
          if (this.newPosition.z != null) v.z = this.newPosition.z;
        } else if (role === GripRole.MID && vIdx != null && vIdx >= 0 && vIdx < vertices.length) {
          // Move the segment: translate vertex vIdx and the next vertex by delta
          const nextIdx = (vIdx + 1) % vertices.length;
          vertices[vIdx].x = (vertices[vIdx].x ?? 0) + dx;
          vertices[vIdx].y = (vertices[vIdx].y ?? 0) + dy;
          vertices[nextIdx].x = (vertices[nextIdx].x ?? 0) + dx;
          vertices[nextIdx].y = (vertices[nextIdx].y ?? 0) + dy;
        }
        break;
      }

      case 'TEXT':
      case 'MTEXT':
      case 'INSERT': {
        if (role === GripRole.INSERTION) {
          g.point = { x: this.newPosition.x, y: this.newPosition.y, z: this.newPosition.z };
        }
        break;
      }

      default:
        break;
    }

    // 3. Invalidate raw tags on modified entity
    if (entity.source) {
      entity.source.rawTags = null;
    }
    entity.state = entity.state || {};
    entity.state.modified = true;

    this.executed = true;

    // 4. Return ChangeSet
    const cs = new ChangeSet(this.name);
    cs.addModified(entity.id, entity, this.preSnapshot, snapshotEntityState(entity));
    return cs;
  }

  undo(document) {
    if (!this.executed || !this.preSnapshot) {
      return new ChangeSet(`UNDO_${this.name}`);
    }

    const entity = (typeof document.getEntity === 'function' ? document.getEntity(this.entityId) : null)
      || document.entitiesById?.get(this.entityId)
      || (Array.isArray(document.entities) ? document.entities.find((e) => e.id === this.entityId || e.handle === this.entityId) : null);
    if (!entity) {
      throw new Error(`Entity not found for undo: ${this.entityId}`);
    }

    restoreEntityState(entity, this.preSnapshot, document);

    this.executed = false;
    const cs = new ChangeSet(`UNDO_${this.name}`);
    cs.addModified(entity.id, entity, null, null);
    return cs;
  }
}
