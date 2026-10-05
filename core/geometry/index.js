/**
 * core/geometry/index.js
 *
 * Public module exports for the CAD Geometry Kernel (Phase 7).
 */

export {
  CadGeometry2D,
  CadSnapService,
  CadSnapMode,
  pointDistance,
  normalizeAngle,
  isAngleBetween,
  bulgeToArc,
  pointOnArc,
  arcMidpoint,
  findEntityIntersections,
  intersectLineLine,
  intersectLineArc,
  intersectLineCircle,
  intersectCircleCircle,
} from './cad-geometry-2d.js';

export {
  offsetLineSegment,
  offsetCircleGeometry,
  offsetArcGeometry,
  offsetPolylineVertices,
} from './cad-offset-math.js';
