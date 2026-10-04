/**
 * core/geometry/cad-offset-math.js
 *
 * 2D Geometric Offset Algorithms for CAD Editing (Offset command).
 * Computes parallel line offsets, concentric circle/arc offsets, and mitered polyline offsets.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

import { intersectLineLine, pointDistance } from './cad-intersections.js';

const EPSILON = 1e-9;

/**
 * Compute parallel offset for a 2D line segment.
 *
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {number} distance
 * @param {{x: number, y: number}} sidePoint - Indicates which side to offset towards
 * @returns {{ start: {x: number, y: number}, end: {x: number, y: number} }}
 */
export function offsetLineSegment(p1, p2, distance, sidePoint) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPSILON) {
    return { start: { ...p1 }, end: { ...p2 } };
  }

  // Normal vector perpendicular to line
  let nx = -dy / len;
  let ny = dx / len;

  // Determine direction to sidePoint
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const toSideX = sidePoint.x - midX;
  const toSideY = sidePoint.y - midY;

  const dot = toSideX * nx + toSideY * ny;
  if (dot < 0) {
    nx = -nx;
    ny = -ny;
  }

  const ox = nx * distance;
  const oy = ny * distance;

  return {
    start: { x: p1.x + ox, y: p1.y + oy, z: p1.z ?? 0 },
    end: { x: p2.x + ox, y: p2.y + oy, z: p2.z ?? 0 },
  };
}

/**
 * Compute concentric offset for a circle.
 *
 * @param {{x: number, y: number}} center
 * @param {number} radius
 * @param {number} distance
 * @param {{x: number, y: number}} sidePoint
 * @returns {{ center: {x: number, y: number}, radius: number }|null}
 */
export function offsetCircleGeometry(center, radius, distance, sidePoint) {
  const dSide = pointDistance(center, sidePoint);
  let newRadius;

  if (dSide >= radius) {
    // Offset outwards
    newRadius = radius + distance;
  } else {
    // Offset inwards
    if (distance >= radius - EPSILON) {
      // Inward offset exceeds radius
      return null;
    }
    newRadius = radius - distance;
  }

  return {
    center: { ...center },
    radius: newRadius,
  };
}

/**
 * Compute concentric offset for an arc.
 *
 * @param {{x: number, y: number}} center
 * @param {number} radius
 * @param {number} startAngle
 * @param {number} endAngle
 * @param {number} distance
 * @param {{x: number, y: number}} sidePoint
 * @returns {{ center: {x: number, y: number}, radius: number, startAngle: number, endAngle: number }|null}
 */
export function offsetArcGeometry(center, radius, startAngle, endAngle, distance, sidePoint) {
  const circleOffset = offsetCircleGeometry(center, radius, distance, sidePoint);
  if (!circleOffset) return null;

  return {
    ...circleOffset,
    startAngle,
    endAngle,
  };
}

/**
 * Compute offset for a 2D polyline vertices array.
 *
 * @param {Array<{x: number, y: number, bulge?: number}>} vertices
 * @param {boolean} closed
 * @param {number} distance
 * @param {{x: number, y: number}} sidePoint
 * @returns {Array<{x: number, y: number, bulge?: number}>}
 */
export function offsetPolylineVertices(vertices, closed, distance, sidePoint) {
  if (!Array.isArray(vertices) || vertices.length < 2) return [];

  // Offset individual line segments
  const offsetSegments = [];
  const count = closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const seg = offsetLineSegment(v1, v2, distance, sidePoint);
    offsetSegments.push(seg);
  }

  if (!closed) {
    const result = [{ x: offsetSegments[0].start.x, y: offsetSegments[0].start.y, bulge: 0 }];

    for (let i = 0; i < offsetSegments.length - 1; i++) {
      const seg1 = offsetSegments[i];
      const seg2 = offsetSegments[i + 1];

      // Intersect adjacent offset lines to find miter vertex
      const hit = intersectLineLine(seg1.start, seg1.end, seg2.start, seg2.end);
      if (hit && pointDistance(hit.point, seg1.end) < distance * 4) {
        result.push({ x: hit.point.x, y: hit.point.y, bulge: 0 });
      } else {
        result.push({ x: seg1.end.x, y: seg1.end.y, bulge: 0 });
      }
    }

    const last = offsetSegments[offsetSegments.length - 1];
    result.push({ x: last.end.x, y: last.end.y, bulge: 0 });
    return result;
  }

  // Closed polyline
  const result = [];
  for (let i = 0; i < offsetSegments.length; i++) {
    const prevSeg = offsetSegments[(i - 1 + offsetSegments.length) % offsetSegments.length];
    const currSeg = offsetSegments[i];

    const hit = intersectLineLine(prevSeg.start, prevSeg.end, currSeg.start, currSeg.end);
    if (hit && pointDistance(hit.point, currSeg.start) < distance * 4) {
      result.push({ x: hit.point.x, y: hit.point.y, bulge: 0 });
    } else {
      result.push({ x: currSeg.start.x, y: currSeg.start.y, bulge: 0 });
    }
  }

  return result;
}
