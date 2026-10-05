/**
 * core/geometry/cad-snaps.js
 *
 * Object Snap (O-Snap) calculation service for 2D CAD drafting and editing.
 * Computes exact geometric snap candidates:
 * - END: Endpoints of lines, arcs, polyline vertices
 * - MID: Midpoints of lines, arcs (along curve), polyline segments (including bulge arcs)
 * - CEN: Center of circles, arcs, and polyline bulge segments
 * - QUAD: Quadrant points (0°, 90°, 180°, 270°) of circles and arcs
 * - INT: Geometric intersections between entities
 * - NEA: Nearest point on entity curves
 * - PERP: Perpendicular foot from basePoint onto entity curves
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import {
  pointDistance,
  normalizeAngle,
  isAngleBetween,
  bulgeToArc,
  findEntityIntersections,
} from './cad-intersections.js';

export const CadSnapMode = Object.freeze({
  END: 'END',
  MID: 'MID',
  CEN: 'CEN',
  QUAD: 'QUAD',
  INT: 'INT',
  NEA: 'NEA',
  PERP: 'PERP',
});

const DEFAULT_SNAP_MODES = [
  CadSnapMode.END,
  CadSnapMode.MID,
  CadSnapMode.CEN,
  CadSnapMode.QUAD,
  CadSnapMode.INT,
  CadSnapMode.PERP,
  CadSnapMode.NEA,
];

const SNAP_PRIORITY = {
  [CadSnapMode.INT]: 1,
  [CadSnapMode.END]: 2,
  [CadSnapMode.MID]: 3,
  [CadSnapMode.CEN]: 4,
  [CadSnapMode.QUAD]: 5,
  [CadSnapMode.PERP]: 6,
  [CadSnapMode.NEA]: 7,
};

const EPSILON = 1e-9;

/**
 * Compute point along circular arc at specific angle in degrees.
 */
export function pointOnArc(center, radius, angleDeg) {
  const rad = (normalizeAngle(angleDeg) * Math.PI) / 180;
  return {
    x: (center.x ?? 0) + radius * Math.cos(rad),
    y: (center.y ?? 0) + radius * Math.sin(rad),
    z: center.z ?? 0,
  };
}

/**
 * Compute the midpoint of an arc along its curve.
 */
export function arcMidpoint(center, radius, startAngle, endAngle) {
  const s = normalizeAngle(startAngle);
  const e = normalizeAngle(endAngle);
  let sweep = e - s;
  if (sweep < 0) sweep += 360;
  if (Math.abs(sweep) < EPSILON) sweep = 360;
  const midAngle = normalizeAngle(s + sweep / 2);
  return pointOnArc(center, radius, midAngle);
}

/**
 * Project point onto line segment, clamped to [0, 1].
 */
export function projectPointToLineSegment(p, a, b) {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPSILON) {
    return { point: { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }, t: 0 };
  }
  const px = (p.x ?? 0) - (a.x ?? 0);
  const py = (p.y ?? 0) - (a.y ?? 0);
  let t = (px * dx + py * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return {
    point: {
      x: (a.x ?? 0) + t * dx,
      y: (a.y ?? 0) + t * dy,
      z: (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0)),
    },
    t,
  };
}

/**
 * Project point perpendicularly onto infinite line passing through a and b.
 */
export function perpendicularPointToLine(p, a, b) {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPSILON) return null;
  const px = (p.x ?? 0) - (a.x ?? 0);
  const py = (p.y ?? 0) - (a.y ?? 0);
  const t = (px * dx + py * dy) / lenSq;
  if (t < -EPSILON || t > 1 + EPSILON) return null; // Outside finite segment
  return {
    x: (a.x ?? 0) + t * dx,
    y: (a.y ?? 0) + t * dy,
    z: (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0)),
  };
}

/**
 * Find nearest point on circular arc or circle.
 */
export function nearestPointOnArc(p, center, radius, startAngle = null, endAngle = null) {
  const dx = (p.x ?? 0) - (center.x ?? 0);
  const dy = (p.y ?? 0) - (center.y ?? 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < EPSILON) {
    const angle = startAngle != null ? startAngle : 0;
    return pointOnArc(center, radius, angle);
  }
  const angleDeg = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
  if (startAngle == null || endAngle == null || isAngleBetween(angleDeg, startAngle, endAngle)) {
    return pointOnArc(center, radius, angleDeg);
  }
  const pStart = pointOnArc(center, radius, startAngle);
  const pEnd = pointOnArc(center, radius, endAngle);
  return pointDistance(p, pStart) < pointDistance(p, pEnd) ? pStart : pEnd;
}

/**
 * Extract snap candidates from a single entity according to requested modes.
 */
export function extractEntitySnaps(entity, modes = DEFAULT_SNAP_MODES, basePoint = null) {
  if (!entity || !entity.geometry) return [];
  const g = entity.geometry;
  const candidates = [];
  const entityId = entity.id;

  const want = (mode) => modes.includes(mode);

  switch (entity.type) {
    case 'LINE': {
      const p1 = g.start ? { x: g.start.x, y: g.start.y, z: g.start.z ?? 0 } : null;
      const p2 = g.end ? { x: g.end.x, y: g.end.y, z: g.end.z ?? 0 } : null;
      if (!p1 || !p2) break;

      if (want(CadSnapMode.END)) {
        candidates.push({ mode: CadSnapMode.END, point: p1, entityId, subIndex: 0 });
        candidates.push({ mode: CadSnapMode.END, point: p2, entityId, subIndex: 1 });
      }
      if (want(CadSnapMode.MID)) {
        candidates.push({
          mode: CadSnapMode.MID,
          point: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2 },
          entityId,
          subIndex: 0,
        });
      }
      if (want(CadSnapMode.PERP) && basePoint) {
        const perp = perpendicularPointToLine(basePoint, p1, p2);
        if (perp) {
          candidates.push({ mode: CadSnapMode.PERP, point: perp, entityId, subIndex: 0 });
        }
      }
      break;
    }

    case 'CIRCLE': {
      const c = g.center ? { x: g.center.x, y: g.center.y, z: g.center.z ?? 0 } : null;
      const r = Number(g.radius) || 0;
      if (!c || r <= 0) break;

      if (want(CadSnapMode.CEN)) {
        candidates.push({ mode: CadSnapMode.CEN, point: c, entityId });
      }
      if (want(CadSnapMode.QUAD)) {
        candidates.push({ mode: CadSnapMode.QUAD, point: { x: c.x + r, y: c.y, z: c.z }, entityId, subIndex: 0 });
        candidates.push({ mode: CadSnapMode.QUAD, point: { x: c.x, y: c.y + r, z: c.z }, entityId, subIndex: 90 });
        candidates.push({ mode: CadSnapMode.QUAD, point: { x: c.x - r, y: c.y, z: c.z }, entityId, subIndex: 180 });
        candidates.push({ mode: CadSnapMode.QUAD, point: { x: c.x, y: c.y - r, z: c.z }, entityId, subIndex: 270 });
      }
      if (want(CadSnapMode.PERP) && basePoint) {
        const dx = (basePoint.x ?? 0) - c.x;
        const dy = (basePoint.y ?? 0) - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > EPSILON) {
          candidates.push({
            mode: CadSnapMode.PERP,
            point: { x: c.x + (dx / dist) * r, y: c.y + (dy / dist) * r, z: c.z },
            entityId,
          });
          candidates.push({
            mode: CadSnapMode.PERP,
            point: { x: c.x - (dx / dist) * r, y: c.y - (dy / dist) * r, z: c.z },
            entityId,
          });
        }
      }
      break;
    }

    case 'ARC': {
      const c = g.center ? { x: g.center.x, y: g.center.y, z: g.center.z ?? 0 } : null;
      const r = Number(g.radius) || 0;
      const s = Number(g.startAngle) || 0;
      const e = Number(g.endAngle) || 0;
      if (!c || r <= 0) break;

      if (want(CadSnapMode.CEN)) {
        candidates.push({ mode: CadSnapMode.CEN, point: c, entityId });
      }
      if (want(CadSnapMode.END)) {
        candidates.push({ mode: CadSnapMode.END, point: pointOnArc(c, r, s), entityId, subIndex: 0 });
        candidates.push({ mode: CadSnapMode.END, point: pointOnArc(c, r, e), entityId, subIndex: 1 });
      }
      if (want(CadSnapMode.MID)) {
        candidates.push({ mode: CadSnapMode.MID, point: arcMidpoint(c, r, s, e), entityId });
      }
      if (want(CadSnapMode.QUAD)) {
        for (const angle of [0, 90, 180, 270]) {
          if (isAngleBetween(angle, s, e)) {
            candidates.push({ mode: CadSnapMode.QUAD, point: pointOnArc(c, r, angle), entityId, subIndex: angle });
          }
        }
      }
      if (want(CadSnapMode.PERP) && basePoint) {
        const dx = (basePoint.x ?? 0) - c.x;
        const dy = (basePoint.y ?? 0) - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > EPSILON) {
          const angle1 = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
          const angle2 = normalizeAngle(angle1 + 180);
          if (isAngleBetween(angle1, s, e)) {
            candidates.push({ mode: CadSnapMode.PERP, point: pointOnArc(c, r, angle1), entityId });
          }
          if (isAngleBetween(angle2, s, e)) {
            candidates.push({ mode: CadSnapMode.PERP, point: pointOnArc(c, r, angle2), entityId });
          }
        }
      }
      break;
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const vertices = g.vertices || [];
      if (vertices.length === 0) break;

      if (want(CadSnapMode.END)) {
        vertices.forEach((v, idx) => {
          candidates.push({
            mode: CadSnapMode.END,
            point: { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 },
            entityId,
            subIndex: idx,
          });
        });
      }

      const count = g.isClosed ? vertices.length : vertices.length - 1;
      for (let i = 0; i < count; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % vertices.length];
        const bulge = Number(p1.bulge) || 0;

        if (Math.abs(bulge) > EPSILON) {
          const arc = bulgeToArc(p1, p2, bulge);
          if (arc) {
            if (want(CadSnapMode.CEN)) {
              candidates.push({ mode: CadSnapMode.CEN, point: arc.center, entityId, subIndex: i });
            }
            if (want(CadSnapMode.MID)) {
              candidates.push({
                mode: CadSnapMode.MID,
                point: arcMidpoint(arc.center, arc.radius, arc.startAngle, arc.endAngle),
                entityId,
                subIndex: i,
              });
            }
          }
        } else {
          if (want(CadSnapMode.MID)) {
            candidates.push({
              mode: CadSnapMode.MID,
              point: {
                x: ((p1.x ?? 0) + (p2.x ?? 0)) / 2,
                y: ((p1.y ?? 0) + (p2.y ?? 0)) / 2,
                z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2,
              },
              entityId,
              subIndex: i,
            });
          }
          if (want(CadSnapMode.PERP) && basePoint) {
            const perp = perpendicularPointToLine(basePoint, p1, p2);
            if (perp) {
              candidates.push({ mode: CadSnapMode.PERP, point: perp, entityId, subIndex: i });
            }
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return candidates;
}

/**
 * CadSnapService provides high-performance, prioritized geometric snapping.
 */
export class CadSnapService {
  constructor(options = {}) {
    this.defaultTolerance = options.tolerance ?? 10.0;
    this.activeModes = options.activeModes ? [...options.activeModes] : [...DEFAULT_SNAP_MODES];
  }

  /**
   * Find nearest snap candidate for a given cursor position.
   *
   * @param {Object} params
   * @param {{x: number, y: number, z?: number}} params.cursorPoint
   * @param {{x: number, y: number, z?: number}} [params.basePoint]
   * @param {Array<import('../../formats/dxf/model/dxf-entity.js').DxfEntity>} [params.entities=[]]
   * @param {import('../spatial/spatial-index.js').SpatialIndex} [params.spatialIndex]
   * @param {Array<string>} [params.activeModes]
   * @param {number} [params.tolerance]
   * @returns {Object|null} Best snap candidate or null
   */
  snap(params) {
    const {
      cursorPoint,
      basePoint = null,
      entities = [],
      spatialIndex = null,
      activeModes = this.activeModes,
      tolerance = this.defaultTolerance,
    } = params;

    if (!cursorPoint) return null;

    let candidateEntities = entities;
    if (spatialIndex && tolerance > 0) {
      const queryBox = {
        minX: (cursorPoint.x ?? 0) - tolerance,
        minY: (cursorPoint.y ?? 0) - tolerance,
        maxX: (cursorPoint.x ?? 0) + tolerance,
        maxY: (cursorPoint.y ?? 0) + tolerance,
      };
      const found = typeof spatialIndex.search === 'function'
        ? spatialIndex.search(queryBox)
        : typeof spatialIndex.query === 'function'
        ? spatialIndex.query(queryBox)
        : [];
      const idSet = new Set(
        found.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean)
      );
      candidateEntities = entities.filter((e) => idSet.has(e.id));
    }

    const allCandidates = [];

    // 1. Extract feature snaps (END, MID, CEN, QUAD, PERP)
    for (const entity of candidateEntities) {
      const snaps = extractEntitySnaps(entity, activeModes, basePoint);
      for (const s of snaps) {
        const d = pointDistance(cursorPoint, s.point);
        if (d <= tolerance) {
          allCandidates.push({ ...s, distance: d });
        }
      }
    }

    // 2. Extract intersection snaps (INT) between pairs of candidate entities
    if (activeModes.includes(CadSnapMode.INT) && candidateEntities.length >= 2) {
      for (let i = 0; i < candidateEntities.length; i++) {
        for (let j = i + 1; j < candidateEntities.length; j++) {
          const e1 = candidateEntities[i];
          const e2 = candidateEntities[j];
          const intersections = findEntityIntersections(e1, e2);
          for (const pt of intersections) {
            const d = pointDistance(cursorPoint, pt);
            if (d <= tolerance) {
              allCandidates.push({
                mode: CadSnapMode.INT,
                point: { x: pt.x, y: pt.y, z: pt.z ?? 0 },
                distance: d,
                entityId: e1.id,
                secondaryEntityId: e2.id,
              });
            }
          }
        }
      }
    }

    // 3. Extract Nearest (NEA) snaps if requested
    if (activeModes.includes(CadSnapMode.NEA)) {
      for (const entity of candidateEntities) {
        const neaPt = this.calculateNearestPoint(entity, cursorPoint);
        if (neaPt) {
          const d = pointDistance(cursorPoint, neaPt);
          if (d <= tolerance) {
            allCandidates.push({
              mode: CadSnapMode.NEA,
              point: neaPt,
              distance: d,
              entityId: entity.id,
            });
          }
        }
      }
    }

    if (allCandidates.length === 0) return null;

    // Feature precedence: Discrete feature snaps (INT, END, MID, CEN, QUAD, PERP)
    // take precedence over continuous NEA when within the snap aperture.
    const discreteCandidates = allCandidates.filter((c) => c.mode !== CadSnapMode.NEA);
    const pool = discreteCandidates.length > 0 ? discreteCandidates : allCandidates;

    // Unified Ranking Policy:
    // Distance (primary) -> Mode Priority (secondary) -> Entity ID tie-breaker
    pool.sort((a, b) => {
      const distDiff = a.distance - b.distance;
      if (Math.abs(distDiff) > 1e-6) {
        return distDiff;
      }
      const prioA = SNAP_PRIORITY[a.mode] ?? 99;
      const prioB = SNAP_PRIORITY[b.mode] ?? 99;
      if (prioA !== prioB) {
        return prioA - prioB;
      }
      return String(a.entityId).localeCompare(String(b.entityId));
    });

    return pool[0];
  }

  /**
   * Calculate nearest point on an entity geometry to a given query point.
   */
  calculateNearestPoint(entity, p) {
    if (!entity || !entity.geometry) return null;
    const g = entity.geometry;

    switch (entity.type) {
      case 'LINE': {
        if (!g.start || !g.end) return null;
        return projectPointToLineSegment(p, g.start, g.end).point;
      }
      case 'CIRCLE': {
        if (!g.center || g.radius <= 0) return null;
        return nearestPointOnArc(p, g.center, g.radius);
      }
      case 'ARC': {
        if (!g.center || g.radius <= 0) return null;
        return nearestPointOnArc(p, g.center, g.radius, g.startAngle, g.endAngle);
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vertices = g.vertices || [];
        if (vertices.length < 2) return null;
        let closest = null;
        let minDist = Infinity;
        const count = g.isClosed ? vertices.length : vertices.length - 1;
        for (let i = 0; i < count; i++) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % vertices.length];
          const bulge = Number(p1.bulge) || 0;
          let candidate = null;
          if (Math.abs(bulge) > EPSILON) {
            const arc = bulgeToArc(p1, p2, bulge);
            if (arc) {
              candidate = nearestPointOnArc(p, arc.center, arc.radius, arc.startAngle, arc.endAngle);
            }
          }
          if (!candidate) {
            candidate = projectPointToLineSegment(p, p1, p2).point;
          }
          const d = pointDistance(p, candidate);
          if (d < minDist) {
            minDist = d;
            closest = candidate;
          }
        }
        return closest;
      }
      default:
        return null;
    }
  }
}
