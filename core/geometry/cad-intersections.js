/**
 * core/geometry/cad-intersections.js
 *
 * 2D Geometric Intersection Algorithms for CAD Editing (Trim, Extend, Fillet).
 * Strictly format-independent 2D mathematics.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

const EPSILON = 1e-9;

export function pointDistance(a, b) {
  if (!a || !b) return Infinity;
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalizeAngle(deg) {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

export function isAngleBetween(deg, startDeg, endDeg) {
  const a = normalizeAngle(deg);
  const s = normalizeAngle(startDeg);
  const e = normalizeAngle(endDeg);

  if (Math.abs(s - e) < EPSILON) return true; // Full circle
  if (s < e) {
    return a >= s - EPSILON && a <= e + EPSILON;
  }
  // Crosses 0 degrees
  return a >= s - EPSILON || a <= e + EPSILON;
}

/**
 * Convert a DXF polyline bulge between two vertices into an exact center, radius, and CCW angles.
 *
 * @param {{x: number, y: number, z?: number}} p1
 * @param {{x: number, y: number, z?: number}} p2
 * @param {number} bulge
 * @returns {{ center: {x: number, y: number, z: number}, radius: number, startAngle: number, endAngle: number }|null}
 */
export function bulgeToArc(p1, p2, bulge) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < EPSILON) return null;

  const dx = (p2.x ?? 0) - (p1.x ?? 0);
  const dy = (p2.y ?? 0) - (p1.y ?? 0);
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < EPSILON) return null;

  const nx = -dy / chord;
  const ny = dx / chord;

  const d = (chord * (1 - b * b)) / (4 * b);
  const cx = ((p1.x ?? 0) + (p2.x ?? 0)) / 2 - nx * d;
  const cy = ((p1.y ?? 0) + (p2.y ?? 0)) / 2 - ny * d;
  const radius = Math.abs((chord * (1 + b * b)) / (4 * b));

  const ang1 = normalizeAngle((Math.atan2((p1.y ?? 0) - cy, (p1.x ?? 0) - cx) * 180) / Math.PI);
  const ang2 = normalizeAngle((Math.atan2((p2.y ?? 0) - cy, (p2.x ?? 0) - cx) * 180) / Math.PI);

  const startAngle = b > 0 ? ang2 : ang1;
  const endAngle = b > 0 ? ang1 : ang2;

  return {
    center: { x: cx, y: cy, z: p1.z ?? 0 },
    radius,
    startAngle,
    endAngle,
  };
}

/**
 * Compute intersection between two 2D lines.
 * Line 1: P1 + t * (P2 - P1)
 * Line 2: P3 + u * (P4 - P3)
 *
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {{x: number, y: number}} p3
 * @param {{x: number, y: number}} p4
 * @param {Object} [options]
 * @param {boolean} [options.asSegments=false] - Requires t in [0, 1] and u in [0, 1]
 * @param {boolean} [options.asRays=false] - Requires t >= 0 and u >= 0
 * @returns {{ point: {x: number, y: number}, t: number, u: number }|null}
 */
export function intersectLineLine(p1, p2, p3, p4, options = {}) {
  const asSegments = Boolean(options.asSegments);
  const asRays = Boolean(options.asRays);

  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < EPSILON) {
    return null; // Lines are parallel or collinear
  }

  const dx13 = p1.x - p3.x;
  const dy13 = p1.y - p3.y;

  const t = (dx2 * dy13 - dy2 * dx13) / denom;
  const u = (dx1 * dy13 - dy1 * dx13) / denom;

  if (asSegments) {
    if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
      return null;
    }
  }

  if (asRays) {
    if (t < -EPSILON || u < -EPSILON) {
      return null;
    }
  }

  const x = p1.x + t * dx1;
  const y = p1.y + t * dy1;

  return { point: { x, y }, t, u };
}

/**
 * Intersect 2D line (P1 to P2) with a circle of given center and radius.
 *
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {{x: number, y: number}} center
 * @param {number} radius
 * @param {Object} [options]
 * @param {boolean} [options.asSegment=false] - Requires t in [0, 1]
 * @returns {Array<{ point: {x: number, y: number}, t: number }>}
 */
export function intersectLineCircle(p1, p2, center, radius, options = {}) {
  const asSegment = Boolean(options.asSegment);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const cx = center.x;
  const cy = center.y;

  const fx = p1.x - cx;
  const fy = p1.y - cy;

  const a = dx * dx + dy * dy;
  if (a < EPSILON) return [];

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) {
    return []; // No intersection
  }

  const results = [];
  const sqrtDisc = Math.sqrt(Math.max(0, discriminant));

  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  const tValues = Math.abs(discriminant) < EPSILON ? [t1] : [t1, t2];

  for (const t of tValues) {
    if (asSegment && (t < -EPSILON || t > 1 + EPSILON)) {
      continue;
    }
    const x = p1.x + t * dx;
    const y = p1.y + t * dy;
    results.push({ point: { x, y }, t });
  }

  return results;
}

/**
 * Intersect 2D line with an arc.
 */
export function intersectLineArc(p1, p2, center, radius, startAngleDeg, endAngleDeg, options = {}) {
  const circleHits = intersectLineCircle(p1, p2, center, radius, options);
  const results = [];

  for (const hit of circleHits) {
    const angleDeg = (Math.atan2(hit.point.y - center.y, hit.point.x - center.x) * 180) / Math.PI;
    const normAngle = normalizeAngle(angleDeg);

    if (isAngleBetween(normAngle, startAngleDeg, endAngleDeg)) {
      results.push({ ...hit, angleDeg: normAngle });
    }
  }

  return results;
}

/**
 * Intersect two circles.
 */
export function intersectCircleCircle(c1, r1, c2, r2) {
  const d = pointDistance(c1, c2);
  if (d > r1 + r2 + EPSILON || d < Math.abs(r1 - r2) - EPSILON || d < EPSILON) {
    return []; // No intersection, or concentric
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));

  const p2x = c1.x + (a * (c2.x - c1.x)) / d;
  const p2y = c1.y + (a * (c2.y - c1.y)) / d;

  if (h < EPSILON) {
    return [{ point: { x: p2x, y: p2y } }];
  }

  const rx = -(c2.y - c1.y) * (h / d);
  const ry = (c2.x - c1.x) * (h / d);

  return [
    { point: { x: p2x + rx, y: p2y + ry } },
    { point: { x: p2x - rx, y: p2y - ry } },
  ];
}

/**
 * Extract 2D segments (lines & arcs) from an entity.
 * Supports LINE, CIRCLE, ARC, LWPOLYLINE.
 */
export function getEntitySegments(entity) {
  if (!entity) return [];
  const type = String(entity.type).toUpperCase();
  const g = entity.geometry || {};

  switch (type) {
    case 'LINE': {
      const s = g.start || { x: 0, y: 0 };
      const e = g.end || { x: 0, y: 0 };
      return [{ type: 'LINE', start: { ...s }, end: { ...e }, entity }];
    }
    case 'CIRCLE': {
      const c = g.center || { x: 0, y: 0 };
      return [{ type: 'CIRCLE', center: { ...c }, radius: g.radius || 0, entity }];
    }
    case 'ARC': {
      const c = g.center || { x: 0, y: 0 };
      return [{
        type: 'ARC',
        center: { ...c },
        radius: g.radius || 0,
        startAngle: g.startAngle || 0,
        endAngle: g.endAngle || 360,
        entity,
      }];
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const vertices = g.vertices || [];
      const segments = [];
      const count = g.closed ? vertices.length : vertices.length - 1;

      for (let i = 0; i < count; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const bulge = v1.bulge || 0;

        if (Math.abs(bulge) < EPSILON) {
          segments.push({
            type: 'LINE',
            start: { x: v1.x, y: v1.y },
            end: { x: v2.x, y: v2.y },
            entity,
            vertexIndex: i,
          });
        } else {
          // Arc segment from bulge
          const arcGeom = bulgeToArc(v1, v2, bulge);
          if (arcGeom) {
            segments.push({
              type: 'ARC',
              ...arcGeom,
              entity,
              vertexIndex: i,
            });
          }
        }
      }
      return segments;
    }
    default:
      return [];
  }
}

/**
 * Unified intersection finder between two CAD entities.
 *
 * @param {import('../model/dxf-entity.js').DxfEntity} entA
 * @param {import('../model/dxf-entity.js').DxfEntity} entB
 * @param {Object} [options]
 * @param {boolean} [options.asSegments=true]
 * @returns {Array<{ x: number, y: number, tA?: number, tB?: number }>}
 */
export function findEntityIntersections(entA, entB, options = { asSegments: true }) {
  if (!entA || !entB || entA === entB) return [];

  const segsA = getEntitySegments(entA);
  const segsB = getEntitySegments(entB);
  const results = [];

  for (const sA of segsA) {
    for (const sB of segsB) {
      if (sA.type === 'LINE' && sB.type === 'LINE') {
        const hit = intersectLineLine(sA.start, sA.end, sB.start, sB.end, options);
        if (hit) results.push({ x: hit.point.x, y: hit.point.y, tA: hit.t, tB: hit.u });
      } else if (sA.type === 'LINE' && (sB.type === 'CIRCLE' || sB.type === 'ARC')) {
        const hits = sB.type === 'CIRCLE'
          ? intersectLineCircle(sA.start, sA.end, sB.center, sB.radius, { asSegment: options.asSegments })
          : intersectLineArc(sA.start, sA.end, sB.center, sB.radius, sB.startAngle, sB.endAngle, { asSegment: options.asSegments });
        for (const h of hits) results.push({ x: h.point.x, y: h.point.y, tA: h.t });
      } else if ((sA.type === 'CIRCLE' || sA.type === 'ARC') && sB.type === 'LINE') {
        const hits = sA.type === 'CIRCLE'
          ? intersectLineCircle(sB.start, sB.end, sA.center, sA.radius, { asSegment: options.asSegments })
          : intersectLineArc(sB.start, sB.end, sA.center, sA.radius, sA.startAngle, sA.endAngle, { asSegment: options.asSegments });
        for (const h of hits) results.push({ x: h.point.x, y: h.point.y, tB: h.t });
      } else if ((sA.type === 'CIRCLE' || sA.type === 'ARC') && (sB.type === 'CIRCLE' || sB.type === 'ARC')) {
        const hits = intersectCircleCircle(sA.center, sA.radius, sB.center, sB.radius);
        for (const h of hits) {
          let validA = true;
          let validB = true;
          if (sA.type === 'ARC') {
            const angA = normalizeAngle((Math.atan2(h.point.y - sA.center.y, h.point.x - sA.center.x) * 180) / Math.PI);
            validA = isAngleBetween(angA, sA.startAngle, sA.endAngle);
          }
          if (sB.type === 'ARC') {
            const angB = normalizeAngle((Math.atan2(h.point.y - sB.center.y, h.point.x - sB.center.x) * 180) / Math.PI);
            validB = isAngleBetween(angB, sB.startAngle, sB.endAngle);
          }
          if (validA && validB) {
            results.push({ x: h.point.x, y: h.point.y });
          }
        }
      }
    }
  }

  // De-duplicate points within tolerance
  const unique = [];
  for (const pt of results) {
    if (!unique.some((u) => pointDistance(u, pt) < 1e-4)) {
      unique.push(pt);
    }
  }

  return unique;
}
