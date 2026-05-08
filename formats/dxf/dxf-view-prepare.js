import { needsLargeCoordinateRecentering } from './dxf-bounds.js';

export function prepareDxfViewMetadata(model, options = {}) {
  const bounds = model.computedBounds;
  model.view = model.view || {};
  model.diagnostics = model.diagnostics || [];

  model.view.preferredProjection = options.preferredProjection || 'DXF_XY';
  model.view.fitBounds = bounds || null;

  if (bounds && needsLargeCoordinateRecentering(bounds, options.largeCoordinateThresholdMm ?? 1000000)) {
    model.view.recenter = {
      enabled: true,
      offset: { ...bounds.center },
      policy: 'VIEW_ONLY_DO_NOT_MUTATE_MODEL_COORDINATES',
    };
    model.diagnostics.push({
      severity: 'INFO',
      code: 'DXF_LARGE_COORDINATES_RECENTERED',
      message: 'Large-coordinate DXF should be recentred in view space only; model coordinates remain unchanged.',
      offset: model.view.recenter.offset,
    });
  } else {
    model.view.recenter = {
      enabled: false,
      offset: { x: 0, y: 0, z: 0 },
      policy: 'NONE',
    };
  }

  return model.view;
}
