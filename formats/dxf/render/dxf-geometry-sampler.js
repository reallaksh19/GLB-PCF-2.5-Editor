import {sampleBulge,sampleNativeSpline} from '../../../geometry/cad/native-curves.js';
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
    this.diagnostics = params.diagnostics || [];
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
export function sampleBulgeArc(p1,p2,bulge,segments=32) { return sampleBulge(p1,p2,bulge,segments); }

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
export function sampleEllipse(center, majorAxis, ratio, startParam = 0, endParam = 2 * Math.PI, segments = 36, normal={x:0,y:0,z:1}) {
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
  const cross={x:normal.y*mz-normal.z*my,y:normal.z*mx-normal.x*mz,z:normal.x*my-normal.y*mx};
  const minorDirectionLen=Math.hypot(cross.x,cross.y,cross.z);
  if (!(minorDirectionLen>0)) throw new Error('Invalid ellipse plane');
  const nx=cross.x/minorDirectionLen,ny=cross.y/minorDirectionLen,nz=cross.z/minorDirectionLen;
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
      z: cz + mz * cos + nz * minorLen * sin,
    });
  }

  return points;
}

/**
 * Generate interpolated points along a SPLINE.
 */
export function sampleSpline(geometry,closed=false,segments=32) {
 if(Array.isArray(geometry))return geometry.map(p=>({...p})); // Explicit control-polygon fallback, never a native spline claim.
 return sampleNativeSpline(geometry,typeof closed==='number'?closed:segments);
}
