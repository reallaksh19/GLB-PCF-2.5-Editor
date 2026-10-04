/**
 * formats/dxf/render/dxf-geometry-sampler.js
 */

export class RenderModel {
  constructor(params = {}) {
    this.version = '1.0.0';
    this.sourceFormat = 'DXF';
    this.sourceDocument = params.sourceDocument || null;
    this.bounds = params.bounds || {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
    };
    this.primitives = params.primitives || [];
    this.primitivesByEntityId = params.primitivesByEntityId || new Map();
    this.primitivesByLayer = params.primitivesByLayer || new Map();
    this.layers = params.layers || [];
    this.stats = params.stats || {};
  }

  /**
   * Look up all render primitives projected for a source entity handle or ID.
   * @param {string} sourceEntityId - e.g. 'dxf:entity:A12B'
   * @returns {Array<Object>}
   */
  getPrimitivesForEntity(sourceEntityId) {
    if (!sourceEntityId) return [];
    return this.primitivesByEntityId.get(String(sourceEntityId)) || [];
  }

  /**
   * Look up all render primitives belonging to a given layer name.
   * @param {string} layerName
   * @returns {Array<Object>}
   */
  getPrimitivesForLayer(layerName) {
    if (!layerName) return [];
    return this.primitivesByLayer.get(String(layerName).trim().toUpperCase()) || [];
  }

  /**
   * Recompute composite bounding box from current primitives.
   * @returns {Object}
   */
  recomputeBounds() {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    function updateBounds(pt) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const x = pt.x, y = pt.y, z = Number.isFinite(pt.z) ? pt.z : 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    for (const prim of this.primitives) {
      if (Array.isArray(prim.points)) {
        for (const p of prim.points) updateBounds(p);
      }
      if (prim.start) updateBounds(prim.start);
      if (prim.end) updateBounds(prim.end);
      if (prim.position) updateBounds(prim.position);
      if (prim.bounds?.corners) {
        for (const c of prim.bounds.corners) updateBounds(c);
      }
    }

    const hasBounds = Number.isFinite(minX) && Number.isFinite(maxX);
    this.bounds = {
      min: hasBounds ? { x: minX, y: minY, z: minZ } : { x: 0, y: 0, z: 0 },
      max: hasBounds ? { x: maxX, y: maxY, z: maxZ } : { x: 0, y: 0, z: 0 },
      size: hasBounds ? { x: maxX - minX, y: maxY - minY, z: maxZ - minZ } : { x: 0, y: 0, z: 0 },
      center: hasBounds ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 } : { x: 0, y: 0, z: 0 },
    };
    return this.bounds;
  }
}

/**
 * Generate tessellated points along an arc segment between two vertices with a given bulge.
 * Accurately places center and sagitta in DXF coordinates (positive bulge curves left of chord).
 */
export function sampleBulgeArc(p1, p2, bulge, maxSegments = 32) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-9) {
    return [
      { x: p1.x ?? 0, y: p1.y ?? 0, z: p1.z ?? 0 },
      { x: p2.x ?? 0, y: p2.y ?? 0, z: p2.z ?? 0 },
    ];
  }

  const dx = (p2.x ?? 0) - (p1.x ?? 0);
  const dy = (p2.y ?? 0) - (p1.y ?? 0);
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < 1e-9) {
    return [{ x: p1.x ?? 0, y: p1.y ?? 0, z: p1.z ?? 0 }];
  }

  // Left unit normal
  const nx = -dy / chord;
  const ny = dx / chord;

  // Center distance from chord midpoint
  const d = (chord * (1 - b * b)) / (4 * b);
  const cx = ((p1.x ?? 0) + (p2.x ?? 0)) / 2 - nx * d;
  const cy = ((p1.y ?? 0) + (p2.y ?? 0)) / 2 - ny * d;
  const cz = p1.z ?? 0;
  const radius = Math.abs((chord * (1 + b * b)) / (4 * b));

  const startAngle = Math.atan2((p1.y ?? 0) - cy, (p1.x ?? 0) - cx);
  const sweep = -4 * Math.atan(b); // angle delta around center

  const segments = Math.max(4, Math.min(maxSegments, Math.ceil((Math.abs(sweep) / Math.PI) * 16)));
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ang = startAngle + t * sweep;
    const z = (p1.z ?? 0) + t * ((p2.z ?? 0) - (p1.z ?? 0));
    points.push({
      x: cx + radius * Math.cos(ang),
      y: cy + radius * Math.sin(ang),
      z,
    });
  }

  return points;
}

/**
 * Generate tessellated points along an ARC entity (always counter-clockwise in DXF).
 */
export function sampleArc(center, radius, startAngleDeg, endAngleDeg, segments = 32) {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const cz = center?.z ?? 0;
  const r = Math.max(0, radius ?? 0);

  const startRad = ((startAngleDeg || 0) * Math.PI) / 180;
  const endRad = ((endAngleDeg || 0) * Math.PI) / 180;

  let sweep = endRad - startRad;
  if (sweep <= 0) sweep += 2 * Math.PI;

  const count = Math.max(4, Math.min(segments, Math.ceil((sweep / Math.PI) * 16)));
  const points = [];

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const ang = startRad + t * sweep;
    points.push({
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      z: cz,
    });
  }

  return points;
}

/**
 * Generate tessellated points along a 360-degree CIRCLE.
 */
export function sampleCircle(center, radius, segments = 36) {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const cz = center?.z ?? 0;
  const r = Math.max(0, radius ?? 0);

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const ang = (i / segments) * 2 * Math.PI;
    points.push({
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      z: cz,
    });
  }
  return points;
}

/**
 * Generate tessellated points along an ELLIPSE entity.
 */
export function sampleEllipse(center, majorAxis, ratio, startParam = 0, endParam = 2 * Math.PI, segments = 36) {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const cz = center?.z ?? 0;

  const mx = majorAxis?.x ?? 1;
  const my = majorAxis?.y ?? 0;
  const mz = majorAxis?.z ?? 0;
  const majorLen = Math.sqrt(mx * mx + my * my + mz * mz);

  if (majorLen < 1e-9) {
    return [{ x: cx, y: cy, z: cz }];
  }

  const r = Math.min(1.0, Math.max(1e-6, Number(ratio) || 1.0));
  // Perpendicular vector for minor axis
  const nx = -my / majorLen;
  const ny = mx / majorLen;
  const minorLen = majorLen * r;

  let sweep = (endParam ?? 2 * Math.PI) - (startParam ?? 0);
  if (sweep <= 0) sweep += 2 * Math.PI;

  const count = Math.max(8, segments);
  const points = [];

  for (let i = 0; i <= count; i++) {
    const t = (startParam ?? 0) + (i / count) * sweep;
    const cos = Math.cos(t);
    const sin = Math.sin(t);

    points.push({
      x: cx + mx * cos + nx * minorLen * sin,
      y: cy + my * cos + ny * minorLen * sin,
      z: cz + mz * cos,
    });
  }

  return points;
}

/**
 * Generate interpolated points along a SPLINE.
 */
export function sampleSpline(pointsList, closed = false, segments = 32) {
  const pts = Array.isArray(pointsList) ? pointsList.filter(Boolean) : [];
  if (pts.length < 2) return pts;
  if (pts.length === 2) return pts;

  // Catmull-Rom spline interpolation through control/fit points
  const result = [];
  const n = pts.length;
  const count = closed ? n : n - 1;
  const stepsPerSpan = Math.max(4, Math.floor(segments / count));

  for (let i = 0; i < count; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : (i === 0 ? pts[0] : pts[i - 1]);
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = closed ? pts[(i + 2) % n] : (i + 2 < n ? pts[i + 2] : p2);

    for (let s = 0; s < stepsPerSpan; s++) {
      const t = s / stepsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom basis matrix (tension = 0.5)
      const q0 = -0.5 * t3 + t2 - 0.5 * t;
      const q1 = 1.5 * t3 - 2.5 * t2 + 1.0;
      const q2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
      const q3 = 0.5 * t3 - 0.5 * t2;

      result.push({
        x: p0.x * q0 + p1.x * q1 + p2.x * q2 + p3.x * q3,
        y: p0.y * q0 + p1.y * q1 + p2.y * q2 + p3.y * q3,
        z: (p0.z || 0) * q0 + (p1.z || 0) * q1 + (p2.z || 0) * q2 + (p3.z || 0) * q3,
      });
    }
  }

  result.push(closed ? result[0] : pts[pts.length - 1]);
  return result;
}

