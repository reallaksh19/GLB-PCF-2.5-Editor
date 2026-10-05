/**
 * core/geometry/cad-geometry-2d.js
 *
 * Unified 2D CAD Geometry Kernel API conforming to Phase 7 specification (Issue #85).
 * Encapsulates geometric intersection, projection, closest-point, and curve math.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import {sourcePlaneZ} from './cad-source-plane.js';
import {
  pointDistance,
  normalizeAngle,
  isAngleBetween,
  bulgeToArc,
  findEntityIntersections,
  intersectLineLine,
  intersectLineArc,
  intersectLineCircle,
  intersectCircleCircle,
} from './cad-intersections.js';

import {
  pointOnArc,
  arcMidpoint,
  projectPointToLineSegment,
  perpendicularPointToLine,
  nearestPointOnArc,
  CadSnapService,
  CadSnapMode,
} from './cad-snaps.js';

import {
  offsetLineSegment,
  offsetCircleGeometry,
  offsetArcGeometry,
  offsetPolylineVertices,
} from './cad-offset-math.js';

export class CadGeometry2D {
  /**
   * Calculate intersection points between two 2D entities.
   * Supports LINE, ARC, CIRCLE, and LWPOLYLINE combinations.
   */
  static intersect(entityA, entityB) {
    const z=sourcePlaneZ(entityA),other=sourcePlaneZ(entityB);
    if(z==null || other==null || Math.abs(z-other)>1e-8)return [];
    return findEntityIntersections(entityA, entityB).map(p=>({...p,z}));
  }

  /**
   * Find closest point on an entity geometry to a query point.
   */
  static closestPoint(entity, point) {
    const snapService = new CadSnapService();
    return snapService.calculateNearestPoint(entity, point);
  }

  /**
   * Project a point onto a line segment defined by two points.
   */
  static project(point, start, end) {
    return projectPointToLineSegment(point, start, end);
  }

  /**
   * Compute perpendicular foot from a point onto a line segment, or null if outside segment.
   */
  static perpendicular(point, start, end) {
    return perpendicularPointToLine(point, start, end);
  }

  /**
   * 2D Euclidean distance between two points.
   */
  static distance(a, b) {
    return pointDistance(a, b);
  }

  /**
   * Calculate point on a circle or arc at a given angle in degrees.
   */
  static pointOnArc(center, radius, angleDeg) {
    return pointOnArc(center, radius, angleDeg);
  }

  /**
   * Compute midpoint along an arc's circular curve.
   */
  static arcMidpoint(center, radius, startAngle, endAngle) {
    return arcMidpoint(center, radius, startAngle, endAngle);
  }

  /**
   * Convert polyline bulge between two vertices into an exact center, radius, and CCW angles.
   */
  static bulgeToArc(p1, p2, bulge) {
    return bulgeToArc(p1, p2, bulge);
  }

  /**
   * Offset an entity by distance towards sidePoint.
   */
  static offset(entity, distance, sidePoint = { x: 0, y: 0 }) {
    if (!entity || !entity.geometry) return null;
    switch (entity.type) {
      case 'LINE':
        return offsetLineSegment(entity.geometry.start, entity.geometry.end, distance, sidePoint);
      case 'CIRCLE':
        return offsetCircleGeometry(entity.geometry.center, entity.geometry.radius, distance, sidePoint);
      case 'ARC':
        return offsetArcGeometry(
          entity.geometry.center,
          entity.geometry.radius,
          entity.geometry.startAngle,
          entity.geometry.endAngle,
          distance,
          sidePoint
        );
      case 'LWPOLYLINE':
      case 'POLYLINE':
        if(entity.geometry.vertices.some(v=>v.bulge || v.startWidth || v.endWidth) || entity.geometry.constantWidth)throw new Error('Unsupported curved/width polyline Offset');
        return offsetPolylineVertices(entity.geometry.vertices, (entity.geometry.closed ?? entity.geometry.isClosed), distance, sidePoint);
      default:
        return null;
    }
  }
}

export {
  CadSnapService,
  CadSnapMode,
  pointDistance,
  normalizeAngle,
  isAngleBetween,
  bulgeToArc,
  findEntityIntersections,
  intersectLineLine,
  intersectLineArc,
  intersectLineCircle,
  intersectCircleCircle,
  pointOnArc,
  arcMidpoint,
};
