/**
 * formats/dxf/spatial/entity-bounds.js
 *
 * CAD Entity Bounds Service.
 * Computes tight axis-aligned bounding boxes (AABBs) for native CAD entities and
 * render primitives without coordinate scaling or Three.js dependencies.
 */

import { sampleBulgeArc } from '../render/dxf-render-adapter.js';
import { resolveTextGeometry, estimateTextBounds } from '../render/dxf-text-renderer.js';

export function createEmptyBounds() {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
    size: { x: 0, y: 0, z: 0 },
    center: { x: 0, y: 0, z: 0 },
    valid: false,
  };
}

export function finalizeBounds(min, max) {
  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    return createEmptyBounds();
  }
  const size = {
    x: max.x - min.x,
    y: max.y - min.y,
    z: max.z - min.z,
  };
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  return {
    min,
    max,
    size,
    center,
    valid: true,
  };
}

export function computePointsBounds(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return createEmptyBounds();
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let count = 0;

  for (const pt of points) {
    if (!pt) continue;
    const x = Number(pt.x);
    const y = Number(pt.y);
    const z = Number.isFinite(Number(pt.z)) ? Number(pt.z) : 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    count++;
  }

  if (count === 0) return createEmptyBounds();
  return finalizeBounds({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
}

/**
 * Computes exact tight bounding box for a 2D/3D circular ARC.
 * Tests endpoints and any 90-degree quadrant extrema (0°, 90°, 180°, 270°)
 * that lie within the counter-clockwise sweep.
 */
export function computeArcBounds(center = { x: 0, y: 0, z: 0 }, radius = 0, startAngleDeg = 0, endAngleDeg = 360) {
  const cx = Number(center.x) || 0;
  const cy = Number(center.y) || 0;
  const cz = Number(center.z) || 0;
  const r = Math.max(0, Number(radius) || 0);

  if (r <= 0) {
    return finalizeBounds({ x: cx, y: cy, z: cz }, { x: cx, y: cy, z: cz });
  }

  const startRad = ((startAngleDeg || 0) * Math.PI) / 180;
  const endRad = ((endAngleDeg || 0) * Math.PI) / 180;

  let sweep = endRad - startRad;
  if (sweep <= 0) sweep += 2 * Math.PI;

  const pts = [
    { x: cx + r * Math.cos(startRad), y: cy + r * Math.sin(startRad), z: cz },
    { x: cx + r * Math.cos(endRad), y: cy + r * Math.sin(endRad), z: cz },
  ];

  // Helper: test if angle theta lies in [startRad, startRad + sweep]
  function angleInSweep(theta) {
    let diff = theta - startRad;
    while (diff < 0) diff += 2 * Math.PI;
    while (diff >= 2 * Math.PI) diff -= 2 * Math.PI;
    return diff <= sweep + 1e-9;
  }

  // 0 deg (+X)
  if (angleInSweep(0) || angleInSweep(2 * Math.PI)) {
    pts.push({ x: cx + r, y: cy, z: cz });
  }
  // 90 deg (+Y)
  if (angleInSweep(Math.PI / 2)) {
    pts.push({ x: cx, y: cy + r, z: cz });
  }
  // 180 deg (-X)
  if (angleInSweep(Math.PI)) {
    pts.push({ x: cx - r, y: cy, z: cz });
  }
  // 270 deg (-Y)
  if (angleInSweep((3 * Math.PI) / 2)) {
    pts.push({ x: cx, y: cy - r, z: cz });
  }

  return computePointsBounds(pts);
}

/**
 * Computes tight bounding box for a polyline (straight & bulge segments).
 */
export function computePolylineBounds(vertices = [], closed = false) {
  if (!Array.isArray(vertices) || vertices.length === 0) {
    return createEmptyBounds();
  }

  const allPoints = [];
  const count = closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const bulge = Number(v1.bulge) || 0;

    if (Math.abs(bulge) > 1e-9) {
      allPoints.push(...sampleBulgeArc(v1, v2, bulge, 16));
    } else {
      allPoints.push(v1, v2);
    }
  }

  return computePointsBounds(allPoints);
}

/**
 * Compute the tight bounding box for any DxfEntity or RenderPrimitive.
 *
 * @param {Object} item - DxfEntity or RenderPrimitive
 * @param {Object} [options]
 * @returns {Object} { min, max, size, center, valid }
 */
export function computeItemBounds(item, options = {}) {
  if (!item) return createEmptyBounds();

  // If item already has points computed (e.g. from RenderModel)
  if (Array.isArray(item.points) && item.points.length > 0) {
    return computePointsBounds(item.points);
  }

  // RenderPrimitive / DxfEntity checks
  const type = String(item.type || '').toUpperCase();
  const geom = item.geometry || item;

  switch (type) {
    case 'LINE': {
      const p1 = geom.start || { x: geom.x1 ?? 0, y: geom.y1 ?? 0, z: geom.z1 ?? 0 };
      const p2 = geom.end || { x: geom.x2 ?? 0, y: geom.y2 ?? 0, z: geom.z2 ?? 0 };
      return computePointsBounds([p1, p2]);
    }

    case 'CIRCLE': {
      const center = geom.center || { x: geom.cx ?? 0, y: geom.cy ?? 0, z: geom.cz ?? 0 };
      const r = Number(geom.radius) || 0;
      return finalizeBounds(
        { x: center.x - r, y: center.y - r, z: center.z || 0 },
        { x: center.x + r, y: center.y + r, z: center.z || 0 }
      );
    }

    case 'ARC': {
      const center = geom.center || { x: geom.cx ?? 0, y: geom.cy ?? 0, z: geom.cz ?? 0 };
      const r = Number(geom.radius) || 0;
      const sa = geom.startAngle ?? 0;
      const ea = geom.endAngle ?? 360;
      return computeArcBounds(center, r, sa, ea);
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = geom.vertices || [];
      const closed = Boolean(geom.closed);
      return computePolylineBounds(verts, closed);
    }

    case 'TEXT':
    case 'MTEXT': {
      const geomInfo = resolveTextGeometry(item);
      const rawText = item.attributes?.rawText || item.attributes?.text || item.text || '';
      const lines = String(rawText).split(/\r?\n|\\P/);
      const bounds = estimateTextBounds(lines, geomInfo);
      return finalizeBounds(bounds.min, bounds.max);
    }

    case 'POINT': {
      const pt = geom.point || geom.position || { x: 0, y: 0, z: 0 };
      return finalizeBounds({ ...pt }, { ...pt });
    }

    case 'SOLID':
    case '3DFACE': {
      const pts = geom.points || geom.vertices || [];
      return computePointsBounds(pts);
    }

    case 'LEADER': {
      const verts = geom.vertices || [];
      return computePointsBounds(verts);
    }

    case 'SPLINE': {
      const pts = geom.fitPoints?.length ? geom.fitPoints : (geom.controlPoints || geom.points || []);
      return computePointsBounds(pts);
    }

    case 'ELLIPSE': {
      const cx = geom.center?.x ?? 0;
      const cy = geom.center?.y ?? 0;
      const cz = geom.center?.z ?? 0;
      const mx = geom.majorAxis?.x ?? 1;
      const my = geom.majorAxis?.y ?? 0;
      const r = Number(geom.ratio) || 1.0;
      const majorLen = Math.sqrt(mx * mx + my * my);
      const minorLen = majorLen * r;
      const maxExtent = Math.max(majorLen, minorLen);
      return finalizeBounds(
        { x: cx - maxExtent, y: cy - maxExtent, z: cz },
        { x: cx + maxExtent, y: cy + maxExtent, z: cz }
      );
    }

    default: {
      if (geom.point) return finalizeBounds(geom.point, geom.point);
      if (item.bounds?.min && item.bounds?.max) {
        return finalizeBounds(item.bounds.min, item.bounds.max);
      }
      return createEmptyBounds();
    }
  }
}

/**
 * Combine multiple bounding boxes into a single enclosing AABB.
 * @param {Array<Object>} boundsList
 * @returns {Object} Combined bounds
 */
export function combineBounds(boundsList = []) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let validCount = 0;

  for (const b of boundsList) {
    if (!b || !b.valid || b.min == null || b.max == null) continue;
    minX = Math.min(minX, b.min.x);
    minY = Math.min(minY, b.min.y);
    minZ = Math.min(minZ, b.min.z ?? 0);
    maxX = Math.max(maxX, b.max.x);
    maxY = Math.max(maxY, b.max.y);
    maxZ = Math.max(maxZ, b.max.z ?? 0);
    validCount++;
  }

  if (validCount === 0) return createEmptyBounds();
  return finalizeBounds({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
}

/**
 * Test whether outerBox fully contains innerBox (Window selection condition).
 */
export function boundsContains(outer, inner) {
  if (!outer || !inner) return false;
  const oMinX = outer.minX ?? outer.min?.x;
  const oMinY = outer.minY ?? outer.min?.y;
  const oMaxX = outer.maxX ?? outer.max?.x;
  const oMaxY = outer.maxY ?? outer.max?.y;

  const iMinX = inner.minX ?? inner.min?.x;
  const iMinY = inner.minY ?? inner.min?.y;
  const iMaxX = inner.maxX ?? inner.max?.x;
  const iMaxY = inner.maxY ?? inner.max?.y;

  return iMinX >= oMinX - 1e-9 &&
         iMaxX <= oMaxX + 1e-9 &&
         iMinY >= oMinY - 1e-9 &&
         iMaxY <= oMaxY + 1e-9;
}

/**
 * Test whether boxA intersects boxB (Crossing selection condition).
 */
export function boundsIntersect(a, b) {
  if (!a || !b) return false;
  const aMinX = a.minX ?? a.min?.x;
  const aMinY = a.minY ?? a.min?.y;
  const aMaxX = a.maxX ?? a.max?.x;
  const aMaxY = a.maxY ?? a.max?.y;

  const bMinX = b.minX ?? b.min?.x;
  const bMinY = b.minY ?? b.min?.y;
  const bMaxX = b.maxX ?? b.max?.x;
  const bMaxY = b.maxY ?? b.max?.y;

  return aMinX <= bMaxX &&
         aMaxX >= bMinX &&
         aMinY <= bMaxY &&
         aMaxY >= bMinY;
}

/**
 * Test if a point (x, y) is inside or within tolerance of a bounding box.
 */
export function pointInBounds(x, y, box, tolerance = 0) {
  if (!box) return false;
  const minX = (box.minX ?? box.min?.x) - tolerance;
  const maxX = (box.maxX ?? box.max?.x) + tolerance;
  const minY = (box.minY ?? box.min?.y) - tolerance;
  const maxY = (box.maxY ?? box.max?.y) + tolerance;

  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/**
 * Compute the minimum Euclidean distance from a point (x, y) to an AABB.
 */
export function distanceToBounds(x, y, box) {
  if (!box) return Infinity;
  const minX = box.minX ?? box.min?.x ?? 0;
  const maxX = box.maxX ?? box.max?.x ?? 0;
  const minY = box.minY ?? box.min?.y ?? 0;
  const maxY = box.maxY ?? box.max?.y ?? 0;

  const dx = Math.max(minX - x, 0, x - maxX);
  const dy = Math.max(minY - y, 0, y - maxY);
  return Math.sqrt(dx * dx + dy * dy);
}
