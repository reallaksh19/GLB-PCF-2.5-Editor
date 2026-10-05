import {SpatialIndex2D} from '../spatial/spatial-index-2d.js';
import {sourceVertices,sourcePlaneZ,insertionAnchor} from '../geometry/cad-source-plane.js';
import {eligibleSnapEntity} from '../geometry/cad-snap-candidates.js';
/**
 * core/grips/grip-manager.js
 *
 * Grip extraction, spatial hit-testing, and interaction controller.
 * Extracts manipulation handles according to CAD entity types (Issue #85 Phase 6 P1 & Phase 7).
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { GripPoint, GripRole, GripState } from './grip-point.js';
import { GripEditCommand } from './grip-edit-command.js';
import { pointDistance, normalizeAngle, bulgeToArc } from '../geometry/cad-intersections.js';
import { pointOnArc, arcMidpoint } from '../geometry/cad-snaps.js';

export class GripManager {
  /**
   * @param {Object} [options]
   * @param {number} [options.pickTolerance=10.0] Hit test tolerance in CAD drawing units
   */
  constructor(options = {}) {
    this.pickTolerance = options.pickTolerance ?? 10.0;
    this.activeGrips = new Map(); // id -> GripPoint
    this.hotGripId = null;
    this.gripIndex=new SpatialIndex2D();
  }

  /**
   * Clear all cached grips.
   */
  clear() {
    this.activeGrips.clear();
    this.gripIndex.clear();
    this.hotGripId = null;
  }

  /**
   * Update active grips from a collection of selected entities.
   * @param {Array<import('../../formats/dxf/model/dxf-entity.js').DxfEntity>} entities
   * @returns {Array<GripPoint>}
   */
  updateGripsForEntities(entities = [],document=null,policy={}) {
    this.clear();
    if (!Array.isArray(entities)) return [];

    for (const entity of entities) {
      if(!eligibleSnapEntity(entity,document,{...policy,editableOnly:true}))continue;
      const entityGrips = this.extractEntityGrips(entity);
      for (const grip of entityGrips) {
        this.activeGrips.set(grip.id, grip);
        this.gripIndex.insert({id:grip.id,minX:grip.point.x,minY:grip.point.y,maxX:grip.point.x,maxY:grip.point.y,grip});
      }
    }

    return Array.from(this.activeGrips.values());
  }

  /**
   * Extract all grip points for an individual CAD entity.
   * @param {import('../../formats/dxf/model/dxf-entity.js').DxfEntity} entity
   * @returns {Array<GripPoint>}
   */
  extractEntityGrips(entity) {
    if (!entity || !entity.id || entity.state?.deleted || sourcePlaneZ(entity)==null) return [];
    const grips = [];
    const id = entity.id;
    const g = entity.geometry;

    switch (entity.type) {
      case 'LINE': {
        if (g.start) {
          grips.push(new GripPoint({
            id: `grip:${id}:START`,
            entityId: id,
            role: GripRole.START,
            point: g.start,
          }));
        }
        if (g.end) {
          grips.push(new GripPoint({
            id: `grip:${id}:END`,
            entityId: id,
            role: GripRole.END,
            point: g.end,
          }));
        }
        if (g.start && g.end) {
          grips.push(new GripPoint({
            id: `grip:${id}:MID`,
            entityId: id,
            role: GripRole.MID,
            point: {
              x: (g.start.x + g.end.x) / 2,
              y: (g.start.y + g.end.y) / 2,
              z: ((g.start.z ?? 0) + (g.end.z ?? 0)) / 2,
            },
          }));
        }
        break;
      }

      case 'CIRCLE': {
        const c = g.center ? { x: g.center.x, y: g.center.y, z: g.center.z ?? 0 } : null;
        const r = Number(g.radius) || 0;
        if (!c || r <= 0) break;

        grips.push(new GripPoint({
          id: `grip:${id}:CENTER`,
          entityId: id,
          role: GripRole.CENTER,
          point: c,
        }));

        const quadrants = [
          { angle: 0, pt: { x: c.x + r, y: c.y, z: c.z } },
          { angle: 90, pt: { x: c.x, y: c.y + r, z: c.z } },
          { angle: 180, pt: { x: c.x - r, y: c.y, z: c.z } },
          { angle: 270, pt: { x: c.x, y: c.y - r, z: c.z } },
        ];

        for (const q of quadrants) {
          grips.push(new GripPoint({
            id: `grip:${id}:QUADRANT:${q.angle}`,
            entityId: id,
            role: GripRole.QUADRANT,
            point: q.pt,
            vertexIndex: q.angle,
          }));
        }
        break;
      }

      case 'ARC': {
        const c = g.center ? { x: g.center.x, y: g.center.y, z: g.center.z ?? 0 } : null;
        const r = Number(g.radius) || 0;
        const s = Number(g.startAngle) || 0;
        const e = Number(g.endAngle) || 0;
        if (!c || r <= 0) break;

        grips.push(new GripPoint({
          id: `grip:${id}:CENTER`,
          entityId: id,
          role: GripRole.CENTER,
          point: c,
        }));

        grips.push(new GripPoint({
          id: `grip:${id}:START`,
          entityId: id,
          role: GripRole.START,
          point: pointOnArc(c, r, s),
        }));

        grips.push(new GripPoint({
          id: `grip:${id}:END`,
          entityId: id,
          role: GripRole.END,
          point: pointOnArc(c, r, e),
        }));

        grips.push(new GripPoint({
          id: `grip:${id}:MID`,
          entityId: id,
          role: GripRole.MID,
          point: arcMidpoint(c, r, s, e),
        }));
        break;
      }

      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vertices = sourceVertices(entity);
        vertices.forEach((v, idx) => {
          grips.push(new GripPoint({
            id: `grip:${id}:VERTEX:${idx}`,
            entityId: id,
            role: GripRole.VERTEX,
            point: { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 },
            vertexIndex: idx,
          }));
        });

        const count = (g.closed ?? g.isClosed) ? vertices.length : vertices.length - 1;
        for (let i = 0; i < count; i++) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % vertices.length];
          const bulge = Number(p1.bulge) || 0;

          let midPt;
          if (Math.abs(bulge) > 1e-9) {
            const arc = bulgeToArc(p1, p2, bulge);
            midPt = arc ? arcMidpoint(arc.center, arc.radius, arc.startAngle, arc.endAngle) : null;
          }
          if (!midPt) {
            midPt = {
              x: ((p1.x ?? 0) + (p2.x ?? 0)) / 2,
              y: ((p1.y ?? 0) + (p2.y ?? 0)) / 2,
              z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2,
            };
          }

          grips.push(new GripPoint({
            id: `grip:${id}:MID:${i}`,
            entityId: id,
            role: GripRole.MID,
            point: midPt,
            vertexIndex: i,
          }));
        }
        break;
      }

      case 'TEXT':
      case 'MTEXT':
      case 'INSERT': {
        const pt = insertionAnchor(entity);
        if(!pt)break;
        grips.push(new GripPoint({
          id: `grip:${id}:INSERTION`,
          entityId: id,
          role: GripRole.INSERTION,
          point: pt,
        }));
        break;
      }

      default:
        break;
    }

    return grips;
  }

  /**
   * Find nearest grip within pick tolerance.
   * @param {{x: number, y: number, z?: number}} cursorPoint
   * @param {number} [tolerance]
   * @returns {GripPoint|null}
   */
  findGripAt(cursorPoint, tolerance = this.pickTolerance) {
    if (!cursorPoint) return null;
    let closestGrip = null;
    let minDist = Infinity;

    if(!Number.isFinite(cursorPoint.x) || !Number.isFinite(cursorPoint.y) || !Number.isFinite(tolerance) || tolerance<0)throw new Error('Invalid grip aperture');
    for (const {grip} of this.gripIndex.searchPoint(cursorPoint.x,cursorPoint.y,tolerance)) {
      const d = pointDistance(cursorPoint, grip.point);
      if (d <= tolerance && (d < minDist || (d===minDist && grip.id.localeCompare(closestGrip.id)<0))) {
        minDist = d;
        closestGrip = grip;
      }
    }

    return closestGrip;
  }

  /**
   * Activate a specific grip point (state = HOT).
   * @param {string} gripId
   * @returns {GripPoint|null}
   */
  activateGrip(gripId) {
    this.clearHotGrip();
    const grip = this.activeGrips.get(gripId);
    if (grip) {
      grip.state = GripState.HOT;
      this.hotGripId = gripId;
      return grip;
    }
    return null;
  }

  /**
   * Reset any hot grip back to cold.
   */
  clearHotGrip() {
    if (this.hotGripId) {
      const current = this.activeGrips.get(this.hotGripId);
      if (current) current.state = GripState.COLD;
      this.hotGripId = null;
    }
  }

  /**
   * Factory for creating a GripEditCommand.
   * @param {GripPoint} grip
   * @param {{x: number, y: number, z?: number}} newPosition
   * @param {{x: number, y: number, z?: number}} [basePosition]
   * @returns {GripEditCommand}
   */
  createGripEditCommand(grip, newPosition, basePosition = null) {
    if (!grip) throw new Error('Cannot create GripEditCommand without a grip');
    return new GripEditCommand({
      entityId: grip.entityId,
      grip,
      newPosition,
      basePosition: basePosition || grip.point,
    });
  }
}
