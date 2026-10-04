/**
 * core/commands/cad/edit-commands/trim-extend-commands.js
 *
 * Native CAD Trim and Extend Commands.
 * - TrimEntitiesCommand: Trims geometry at cutting edges based on pick point.
 * - ExtendEntitiesCommand: Extends geometry to boundary edges based on pick point.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 * Touched-only rawTags invalidation on mutated entities (Invariant 1).
 */

import { CadCommand } from '../cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState } from '../change-set.js';
import { DxfEntity } from '../../../../formats/dxf/model/dxf-entity.js';
import {
  findEntityIntersections,
  pointDistance,
  normalizeAngle,
  isAngleBetween,
  intersectLineLine,
} from '../../../geometry/cad-intersections.js';

const EPSILON = 1e-4;

/**
 * Trim an entity at intersection points with cutting edges.
 */
export class TrimEntitiesCommand extends CadCommand {
  /**
   * @param {Object} params
   * @param {string} params.entityId - ID of entity to trim
   * @param {Array<string>} params.cuttingEdgeIds - IDs of cutting entities
   * @param {{x: number, y: number}} params.clickPoint - Point picked on the section to remove
   */
  constructor(params) {
    super({ name: 'TRIM', description: `Trim entity ${params.entityId}` });
    this.entityId = params.entityId;
    this.cuttingEdgeIds = Array.isArray(params.cuttingEdgeIds) ? params.cuttingEdgeIds : [params.cuttingEdgeIds];
    this.clickPoint = { x: params.clickPoint?.x ?? 0, y: params.clickPoint?.y ?? 0 };

    this.beforeSnapshot = null;
    this.createdEntities = [];
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    const target = document.getEntity(this.entityId);
    if (!target) return changeSet;

    const cuttingEntities = this.cuttingEdgeIds
      .map((id) => document.getEntity(id))
      .filter((ent) => ent && ent.id !== target.id);

    if (cuttingEntities.length === 0) return changeSet;

    // Collect all intersection points between target and cutting entities
    const allHits = [];
    for (const cutter of cuttingEntities) {
      const hits = findEntityIntersections(target, cutter, { asSegments: true });
      allHits.push(...hits);
    }

    if (allHits.length === 0) return changeSet;

    this.beforeSnapshot = snapshotEntityState(target);
    this.createdEntities = [];

    const type = String(target.type).toUpperCase();

    if (type === 'LINE') {
      const s = target.geometry.start;
      const e = target.geometry.end;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-9) return changeSet;

      // Project hits onto line parameter t in (0, 1)
      const tHits = [];
      for (const hit of allHits) {
        const t = ((hit.x - s.x) * dx + (hit.y - s.y) * dy) / lenSq;
        if (t > EPSILON && t < 1 - EPSILON) {
          if (!tHits.some((existing) => Math.abs(existing - t) < EPSILON)) {
            tHits.push(t);
          }
        }
      }

      if (tHits.length === 0) return changeSet;
      tHits.sort((a, b) => a - b);

      // Partitions along line: [0, t0], [t0, t1], ..., [tk, 1]
      const partitions = [0, ...tHits, 1];
      const segments = [];

      for (let i = 0; i < partitions.length - 1; i++) {
        const tStart = partitions[i];
        const tEnd = partitions[i + 1];
        const midT = (tStart + tEnd) / 2;
        const midPt = { x: s.x + midT * dx, y: s.y + midT * dy };
        const distToClick = pointDistance(midPt, this.clickPoint);
        segments.push({ tStart, tEnd, distToClick, index: i });
      }

      // Find segment to discard (closest to clickPoint)
      segments.sort((a, b) => a.distToClick - b.distToClick);
      const discard = segments[0];

      if (discard.tStart === 0) {
        // Trimming start of line: move start to tEnd
        target.geometry.start = {
          x: s.x + discard.tEnd * dx,
          y: s.y + discard.tEnd * dy,
          z: s.z ?? 0,
        };
        target.markModified();
        target.source.rawTags = null;
        changeSet.addModified(target.id, target, this.beforeSnapshot, snapshotEntityState(target));
      } else if (discard.tEnd === 1) {
        // Trimming end of line: move end to tStart
        target.geometry.end = {
          x: s.x + discard.tStart * dx,
          y: s.y + discard.tStart * dy,
          z: e.z ?? 0,
        };
        target.markModified();
        target.source.rawTags = null;
        changeSet.addModified(target.id, target, this.beforeSnapshot, snapshotEntityState(target));
      } else {
        // Trimming middle of line: split into two lines
        const oldEnd = { ...target.geometry.end };

        // 1st segment: mutate original line (0 to discard.tStart)
        target.geometry.end = {
          x: s.x + discard.tStart * dx,
          y: s.y + discard.tStart * dy,
          z: e.z ?? 0,
        };
        target.markModified();
        target.source.rawTags = null;
        changeSet.addModified(target.id, target, this.beforeSnapshot, snapshotEntityState(target));

        // 2nd segment: new line from discard.tEnd to oldEnd
        const splitLine = new DxfEntity({
          type: 'LINE',
          layerId: target.layerId,
          space: target.space,
          style: JSON.parse(JSON.stringify(target.style || {})),
          geometry: {
            start: { x: s.x + discard.tEnd * dx, y: s.y + discard.tEnd * dy, z: s.z ?? 0 },
            end: oldEnd,
          },
          state: { modified: true, generated: true },
        });
        document.addEntity(splitLine);
        this.createdEntities.push(splitLine);
        changeSet.addAdded(splitLine);
      }
    } else if (type === 'CIRCLE' && allHits.length >= 2) {
      // Circle trimmed by 2+ hits becomes an ARC
      const c = target.geometry.center;
      const r = target.geometry.radius;

      const angles = allHits.map((h) => normalizeAngle((Math.atan2(h.y - c.y, h.x - c.x) * 180) / Math.PI));
      angles.sort((a, b) => a - b);

      const clickAngle = normalizeAngle((Math.atan2(this.clickPoint.y - c.y, this.clickPoint.x - c.x) * 180) / Math.PI);

      // Identify arc span that does NOT contain clickAngle
      let arcStart = angles[0];
      let arcEnd = angles[1];

      if (isAngleBetween(clickAngle, arcStart, arcEnd)) {
        // Swap so kept arc does not contain clickAngle
        [arcStart, arcEnd] = [arcEnd, arcStart];
      }

      // Convert circle entity into ARC
      target.type = 'ARC';
      target.geometry.startAngle = arcStart;
      target.geometry.endAngle = arcEnd;
      target.markModified();
      target.source.rawTags = null;
      changeSet.addModified(target.id, target, this.beforeSnapshot, snapshotEntityState(target));
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);
    const target = document.getEntity(this.entityId);

    if (target && this.beforeSnapshot) {
      const current = snapshotEntityState(target);
      restoreEntityState(target, this.beforeSnapshot, document);
      changeSet.addModified(target.id, target, current, this.beforeSnapshot);
    }

    for (const ent of this.createdEntities) {
      const res = document.removeEntity(ent.id);
      if (res && res.entity) {
        changeSet.addDeleted(res.entity, res.index);
      }
    }

    this.executed = false;
    return changeSet;
  }
}

/**
 * Extend an entity to boundary edges.
 */
export class ExtendEntitiesCommand extends CadCommand {
  /**
   * @param {Object} params
   * @param {string} params.entityId
   * @param {Array<string>} params.boundaryEdgeIds
   * @param {{x: number, y: number}} params.pickPoint - Point picked to choose which end to extend
   */
  constructor(params) {
    super({ name: 'EXTEND', description: `Extend entity ${params.entityId}` });
    this.entityId = params.entityId;
    this.boundaryEdgeIds = Array.isArray(params.boundaryEdgeIds) ? params.boundaryEdgeIds : [params.boundaryEdgeIds];
    this.pickPoint = { x: params.pickPoint?.x ?? 0, y: params.pickPoint?.y ?? 0 };

    this.beforeSnapshot = null;
  }

  execute(document) {
    const changeSet = new ChangeSet(this.name);
    const target = document.getEntity(this.entityId);
    if (!target) return changeSet;

    const boundaries = this.boundaryEdgeIds
      .map((id) => document.getEntity(id))
      .filter((ent) => ent && ent.id !== target.id);

    if (boundaries.length === 0) return changeSet;

    const type = String(target.type).toUpperCase();
    if (type !== 'LINE') {
      return changeSet; // Currently LINE extension is primary
    }

    const s = target.geometry.start;
    const e = target.geometry.end;

    const distToS = pointDistance(this.pickPoint, s);
    const distToE = pointDistance(this.pickPoint, e);
    const extendEnd = distToE <= distToS;

    const origin = extendEnd ? e : s;
    const from = extendEnd ? s : e;
    const dx = origin.x - from.x;
    const dy = origin.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < EPSILON) return changeSet;

    const dirX = dx / len;
    const dirY = dy / len;

    // Ray: origin + t * dir, t > 0
    let bestT = Infinity;
    let bestPoint = null;

    for (const b of boundaries) {
      if (b.type === 'LINE') {
        const bs = b.geometry.start;
        const be = b.geometry.end;
        const rayPoint = { x: origin.x + dirX, y: origin.y + dirY };
        const hit = intersectLineLine(origin, rayPoint, bs, be, { asSegments: false });

        if (hit && hit.t > EPSILON && hit.u >= -EPSILON && hit.u <= 1 + EPSILON) {
          if (hit.t < bestT) {
            bestT = hit.t;
            bestPoint = hit.point;
          }
        }
      }
    }

    if (!bestPoint) return changeSet;

    this.beforeSnapshot = snapshotEntityState(target);

    if (extendEnd) {
      target.geometry.end = { x: bestPoint.x, y: bestPoint.y, z: e.z ?? 0 };
    } else {
      target.geometry.start = { x: bestPoint.x, y: bestPoint.y, z: s.z ?? 0 };
    }

    target.markModified();
    target.source.rawTags = null;

    const after = snapshotEntityState(target);
    changeSet.addModified(target.id, target, this.beforeSnapshot, after);

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);
    const target = document.getEntity(this.entityId);

    if (target && this.beforeSnapshot) {
      const current = snapshotEntityState(target);
      restoreEntityState(target, this.beforeSnapshot, document);
      changeSet.addModified(target.id, target, current, this.beforeSnapshot);
    }

    this.executed = false;
    return changeSet;
  }
}
