/**
 * core/commands/cad/edit-commands/fillet-offset-commands.js
 *
 * Native CAD Fillet and Offset Commands.
 * - FilletCommand: Connects two non-parallel lines with an arc of specified radius (or sharp corner if radius=0).
 * - OffsetCommand: Creates concentric/parallel copies of entities at a specified distance.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 * Touched-only rawTags invalidation on mutated entities (Invariant 1).
 */

import { CadCommand } from '../cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState } from '../change-set.js';
import { DxfEntity } from '../../../../formats/dxf/model/dxf-entity.js';
import {
  intersectLineLine,
  pointDistance,
  normalizeAngle,
} from '../../../geometry/cad-intersections.js';
import {
  offsetLineSegment,
  offsetCircleGeometry,
  offsetArcGeometry,
  offsetPolylineVertices,
} from '../../../geometry/cad-offset-math.js';

const EPSILON = 1e-6;

/**
 * Fillet two lines with an arc of specified radius.
 * If radius = 0, trims/extends both lines to meet at their exact intersection point.
 */
export class FilletCommand extends CadCommand {
  /**
   * @param {Object} params
   * @param {string} params.entity1Id
   * @param {string} params.entity2Id
   * @param {number} [params.radius=0]
   */
  constructor(params) {
    super({ name: 'FILLET', description: `Fillet entities ${params.entity1Id} & ${params.entity2Id} (R=${params.radius ?? 0})` });
    this.entity1Id = params.entity1Id;
    this.entity2Id = params.entity2Id;
    this.radius = Math.max(0, Number(params.radius) || 0);

    this.snapshots = new Map();
    this.createdArc = null;
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    const line1 = document.getEntity(this.entity1Id);
    const line2 = document.getEntity(this.entity2Id);

    if (!line1 || !line2 || line1.id === line2.id) return changeSet;
    if (line1.type !== 'LINE' || line2.type !== 'LINE') return changeSet;

    const p1 = line1.geometry.start;
    const p2 = line1.geometry.end;
    const p3 = line2.geometry.start;
    const p4 = line2.geometry.end;

    // Intersection of infinite lines
    const hit = intersectLineLine(p1, p2, p3, p4, { asSegments: false });
    if (!hit) {
      return changeSet; // Lines are parallel
    }

    const P = hit.point;
    this.snapshots.set(line1.id, snapshotEntityState(line1));
    this.snapshots.set(line2.id, snapshotEntityState(line2));

    // Determine which endpoint of each line is closer to intersection P
    const dist1S = pointDistance(p1, P);
    const dist1E = pointDistance(p2, P);
    const line1NearEnd = dist1E < dist1S; // If true, end is closer to P

    const dist2S = pointDistance(p3, P);
    const dist2E = pointDistance(p4, P);
    const line2NearEnd = dist2E < dist2S; // If true, end is closer to P

    const farPt1 = line1NearEnd ? p1 : p2;
    const farPt2 = line2NearEnd ? p3 : p4;

    // Unit directions pointing AWAY from intersection P towards the far points
    const d1x = farPt1.x - P.x;
    const d1y = farPt1.y - P.y;
    const len1 = Math.sqrt(d1x * d1x + d1y * d1y);

    const d2x = farPt2.x - P.x;
    const d2y = farPt2.y - P.y;
    const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

    if (len1 < EPSILON || len2 < EPSILON) return changeSet;

    const u1 = { x: d1x / len1, y: d1y / len1 };
    const u2 = { x: d2x / len2, y: d2y / len2 };

    if (this.radius === 0) {
      // Sharp corner: set closer endpoint of each line to P
      if (line1NearEnd) {
        line1.geometry.end = { x: P.x, y: P.y, z: p2.z ?? 0 };
      } else {
        line1.geometry.start = { x: P.x, y: P.y, z: p1.z ?? 0 };
      }

      if (line2NearEnd) {
        line2.geometry.end = { x: P.x, y: P.y, z: p4.z ?? 0 };
      } else {
        line2.geometry.start = { x: P.x, y: P.y, z: p3.z ?? 0 };
      }

      line1.markModified();
      line1.source.rawTags = null;
      line2.markModified();
      line2.source.rawTags = null;

      changeSet.addModified(line1.id, line1, this.snapshots.get(line1.id), snapshotEntityState(line1));
      changeSet.addModified(line2.id, line2, this.snapshots.get(line2.id), snapshotEntityState(line2));
    } else {
      // Fillet arc with radius > 0
      // Dot product between directions
      const dot = u1.x * u2.x + u1.y * u2.y;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot))); // Angle between vectors
      if (Math.abs(angle) < 1e-4 || Math.abs(angle - Math.PI) < 1e-4) {
        return changeSet;
      }

      // Distance from intersection P to tangent points
      const d = this.radius / Math.tan(angle / 2);

      const cleanFloat = (n) => Math.round(n * 1e10) / 1e10;

      // Tangent points T1 and T2
      const t1 = { x: cleanFloat(P.x + u1.x * d), y: cleanFloat(P.y + u1.y * d) };
      const t2 = { x: cleanFloat(P.x + u2.x * d), y: cleanFloat(P.y + u2.y * d) };

      // Bisector vector
      const bx = u1.x + u2.x;
      const by = u1.y + u2.y;
      const blen = Math.sqrt(bx * bx + by * by);
      if (blen < EPSILON) return changeSet;

      const bisector = { x: bx / blen, y: by / blen };
      const distToCenter = this.radius / Math.sin(angle / 2);
      const center = {
        x: cleanFloat(P.x + bisector.x * distToCenter),
        y: cleanFloat(P.y + bisector.y * distToCenter),
      };

      // Angles from center to T1 and T2
      let a1 = normalizeAngle((Math.atan2(t1.y - center.y, t1.x - center.x) * 180) / Math.PI);
      let a2 = normalizeAngle((Math.atan2(t2.y - center.y, t2.x - center.x) * 180) / Math.PI);

      // Determine counter-clockwise arc direction: cross product of (T1 - C) and (T2 - C)
      const v1x = t1.x - center.x;
      const v1y = t1.y - center.y;
      const v2x = t2.x - center.x;
      const v2y = t2.y - center.y;
      const cross = v1x * v2y - v1y * v2x;

      let startAngle = a1;
      let endAngle = a2;
      if (cross < 0) {
        startAngle = a2;
        endAngle = a1;
      }

      // Trim lines to tangent points
      if (line1NearEnd) {
        line1.geometry.end = { x: t1.x, y: t1.y, z: p2.z ?? 0 };
      } else {
        line1.geometry.start = { x: t1.x, y: t1.y, z: p1.z ?? 0 };
      }

      if (line2NearEnd) {
        line2.geometry.end = { x: t2.x, y: t2.y, z: p4.z ?? 0 };
      } else {
        line2.geometry.start = { x: t2.x, y: t2.y, z: p3.z ?? 0 };
      }

      line1.markModified();
      line1.source.rawTags = null;
      line2.markModified();
      line2.source.rawTags = null;

      // Create new fillet ARC entity
      this.createdArc = new DxfEntity({
        type: 'ARC',
        layerId: line1.layerId,
        space: line1.space,
        style: JSON.parse(JSON.stringify(line1.style || {})),
        geometry: {
          center: { x: center.x, y: center.y, z: 0 },
          radius: this.radius,
          startAngle,
          endAngle,
        },
        state: { modified: true, generated: true },
      });

      document.addEntity(this.createdArc);

      changeSet.addModified(line1.id, line1, this.snapshots.get(line1.id), snapshotEntityState(line1));
      changeSet.addModified(line2.id, line2, this.snapshots.get(line2.id), snapshotEntityState(line2));
      changeSet.addAdded(this.createdArc);
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    for (const [id, snap] of this.snapshots.entries()) {
      const ent = document.getEntity(id);
      if (ent) {
        const cur = snapshotEntityState(ent);
        restoreEntityState(ent, snap, document);
        changeSet.addModified(id, ent, cur, snap);
      }
    }

    if (this.createdArc) {
      const res = document.removeEntity(this.createdArc.id);
      if (res && res.entity) {
        changeSet.addDeleted(res.entity, res.index);
      }
      this.createdArc = null;
    }

    this.executed = false;
    return changeSet;
  }
}

/**
 * Offset an entity (LINE, CIRCLE, ARC, LWPOLYLINE) by a distance towards a sidePoint.
 */
export class OffsetCommand extends CadCommand {
  /**
   * @param {Object} params
   * @param {string} params.entityId
   * @param {number} params.distance
   * @param {{x: number, y: number}} params.sidePoint
   */
  constructor(params) {
    super({ name: 'OFFSET', description: `Offset entity ${params.entityId} by ${params.distance}` });
    this.entityId = params.entityId;
    this.distance = Math.max(1e-6, Number(params.distance) || 1);
    this.sidePoint = { x: params.sidePoint?.x ?? 0, y: params.sidePoint?.y ?? 0 };
    this.createdEntity = null;
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    const target = document.getEntity(this.entityId);
    if (!target) return changeSet;

    const type = String(target.type).toUpperCase();
    let newGeometry = null;

    if (type === 'LINE') {
      const s = target.geometry.start;
      const e = target.geometry.end;
      const res = offsetLineSegment(s, e, this.distance, this.sidePoint);
      newGeometry = { start: res.start, end: res.end };
    } else if (type === 'CIRCLE') {
      const c = target.geometry.center;
      const r = target.geometry.radius;
      const res = offsetCircleGeometry(c, r, this.distance, this.sidePoint);
      if (res) newGeometry = { center: res.center, radius: res.radius };
    } else if (type === 'ARC') {
      const c = target.geometry.center;
      const r = target.geometry.radius;
      const s = target.geometry.startAngle;
      const e = target.geometry.endAngle;
      const res = offsetArcGeometry(c, r, s, e, this.distance, this.sidePoint);
      if (res) newGeometry = { center: res.center, radius: res.radius, startAngle: res.startAngle, endAngle: res.endAngle };
    } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const verts = target.geometry.vertices || [];
      const closed = Boolean(target.geometry.closed);
      const res = offsetPolylineVertices(verts, closed, this.distance, this.sidePoint);
      if (res.length > 0) newGeometry = { vertices: res, closed };
    }

    if (!newGeometry) return changeSet;

    this.createdEntity = new DxfEntity({
      type: target.type,
      layerId: target.layerId,
      space: target.space,
      style: JSON.parse(JSON.stringify(target.style || {})),
      geometry: newGeometry,
      attributes: JSON.parse(JSON.stringify(target.attributes || {})),
      state: { modified: true, generated: true },
    });

    document.addEntity(this.createdEntity);
    changeSet.addAdded(this.createdEntity);

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);
    if (this.createdEntity) {
      const res = document.removeEntity(this.createdEntity.id);
      if (res && res.entity) {
        changeSet.addDeleted(res.entity, res.index);
      }
      this.createdEntity = null;
    }
    this.executed = false;
    return changeSet;
  }
}
