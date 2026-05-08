export const DXF_INSUNITS = {
  0: { label: 'Unitless', mmPerUnit: 1 },
  1: { label: 'Inches', mmPerUnit: 25.4 },
  2: { label: 'Feet', mmPerUnit: 304.8 },
  4: { label: 'Millimetres', mmPerUnit: 1 },
  5: { label: 'Centimetres', mmPerUnit: 10 },
  6: { label: 'Metres', mmPerUnit: 1000 },
  7: { label: 'Kilometres', mmPerUnit: 1000000 },
  10: { label: 'Yards', mmPerUnit: 914.4 },
};

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveDxfUnits(header = {}, options = {}) {
  const insunits = finiteNumber(header.$INSUNITS, 0) ?? 0;
  const known = DXF_INSUNITS[insunits];
  const fallbackMmPerUnit = finiteNumber(options.defaultMmPerUnit, 1) || 1;

  return {
    insunits,
    label: known?.label || `Unknown INSUNITS ${insunits}`,
    mmPerUnit: known?.mmPerUnit || fallbackMmPerUnit,
    measurement: finiteNumber(header.$MEASUREMENT, null),
    isKnown: Boolean(known),
    canonicalUnit: 'mm',
  };
}

export function scalePointToMm(point, mmPerUnit = 1) {
  if (!point || typeof point !== 'object') return null;
  return {
    x: Number(point.x || 0) * mmPerUnit,
    y: Number(point.y || 0) * mmPerUnit,
    z: Number(point.z || 0) * mmPerUnit,
    ...(point.bulge != null ? { bulge: Number(point.bulge || 0) } : {}),
  };
}

export function scaleLengthToMm(value, mmPerUnit = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n * mmPerUnit : value;
}
