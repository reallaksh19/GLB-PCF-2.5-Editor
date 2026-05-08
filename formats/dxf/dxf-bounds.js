import { scalePointToMm } from './dxf-units.js';

function emptyBounds() {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
    count: 0,
  };
}

function addPoint(bounds, point) {
  if (!point) return bounds;
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return bounds;

  bounds.min.x = Math.min(bounds.min.x, x);
  bounds.min.y = Math.min(bounds.min.y, y);
  bounds.min.z = Math.min(bounds.min.z, z);
  bounds.max.x = Math.max(bounds.max.x, x);
  bounds.max.y = Math.max(bounds.max.y, y);
  bounds.max.z = Math.max(bounds.max.z, z);
  bounds.count += 1;
  return bounds;
}

function addCircleBounds(bounds, center, radius) {
  const r = Number(radius || 0);
  if (!center || r <= 0) return addPoint(bounds, center);
  addPoint(bounds, { x: center.x - r, y: center.y - r, z: center.z || 0 });
  addPoint(bounds, { x: center.x + r, y: center.y + r, z: center.z || 0 });
  return bounds;
}

function finalizeBounds(bounds) {
  if (!bounds.count) return null;
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  return {
    min: bounds.min,
    max: bounds.max,
    center: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    },
    size,
    diagonal: Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2),
    count: bounds.count,
  };
}

export function extractHeaderExtents(header = {}, mmPerUnit = 1) {
  const extMin = header.$EXTMIN || header.EXTMIN || null;
  const extMax = header.$EXTMAX || header.EXTMAX || null;
  if (!extMin || !extMax) return null;
  return finalizeBounds(
    addPoint(
      addPoint(emptyBounds(), scalePointToMm(extMin, mmPerUnit)),
      scalePointToMm(extMax, mmPerUnit)
    )
  );
}

export function computeDxfBounds(model = {}) {
  const b = emptyBounds();

  for (const line of model.lines || []) {
    addPoint(b, { x: line.x1, y: line.y1, z: line.z1 });
    addPoint(b, { x: line.x2, y: line.y2, z: line.z2 });
  }
  for (const arc of model.arcs || []) {
    addCircleBounds(b, { x: arc.cx, y: arc.cy, z: arc.cz }, arc.radius);
  }
  for (const circle of model.circles || []) {
    addCircleBounds(b, { x: circle.cx, y: circle.cy, z: circle.cz }, circle.radius);
  }
  for (const text of model.texts || []) {
    addPoint(b, { x: text.x, y: text.y, z: text.z });
  }
  for (const insert of model.inserts || []) {
    addPoint(b, insert.position || { x: insert.x, y: insert.y, z: insert.z });
  }
  for (const polyline of model.polylines || []) {
    for (const p of polyline.vertices || []) addPoint(b, p);
  }
  for (const guide of model.guides || []) {
    for (const p of guide.points || []) addPoint(b, p);
  }

  return finalizeBounds(b);
}

export function compareDxfExtents(model, options = {}) {
  model.diagnostics = model.diagnostics || [];
  const header = model.headerExtents;
  const computed = model.computedBounds;

  if (!computed) {
    model.diagnostics.push({
      severity: 'ERROR',
      code: 'DXF_GEOMETRY_EMPTY',
      message: 'No renderable DXF geometry contributed to computed bounds.',
    });
    return;
  }

  if (!header) {
    model.diagnostics.push({
      severity: 'WARN',
      code: 'DXF_EXTENTS_MISSING',
      message: 'DXF header extents are missing; viewer fit will use computed geometry bounds.',
    });
    return;
  }

  const hd = Math.max(header.diagonal || 0, 1e-9);
  const cd = Math.max(computed.diagonal || 0, 1e-9);
  const ratio = Math.abs(hd - cd) / Math.max(hd, cd);
  const tolerance = Number(options.ratioTolerance ?? 0.05);

  if (ratio > tolerance) {
    model.diagnostics.push({
      severity: 'WARN',
      code: 'DXF_EXTENTS_MISMATCH',
      ratio,
      header,
      computed,
      message: 'DXF header extents differ from computed geometry bounds.',
    });
  }
}

export function needsLargeCoordinateRecentering(bounds, thresholdMm = 1000000) {
  if (!bounds?.center) return false;
  return Math.max(Math.abs(bounds.center.x), Math.abs(bounds.center.y), Math.abs(bounds.center.z)) > thresholdMm;
}
