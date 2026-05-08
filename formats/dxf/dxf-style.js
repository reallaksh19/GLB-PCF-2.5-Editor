export const DXF_ACI_RGB = {
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  7: 0xffffff,
  8: 0x808080,
  9: 0xc0c0c0,
};

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function aciToRgb(aci, fallback = 0xb8c4d2) {
  const n = finiteNumber(aci, null);
  if (n === null) return fallback;
  return DXF_ACI_RGB[n] || fallback;
}

function normalizeLayer(layer = {}) {
  const colorIndex = finiteNumber(layer.colorNumber ?? layer.colorIndex ?? layer.color, 7);
  return {
    name: String(layer.name || '0'),
    colorIndex,
    color: aciToRgb(colorIndex),
    lineType: String(layer.lineTypeName || layer.linetype || layer.lineType || 'CONTINUOUS').toUpperCase(),
    lineWeight: finiteNumber(layer.lineWeight ?? layer.lineweight, null),
    visible: layer.visible !== false && layer.off !== true,
    frozen: layer.frozen === true,
    locked: layer.locked === true,
    raw: layer,
  };
}

export function normalizeLayerTable(dxf = {}) {
  const out = {};
  const layers = dxf?.tables?.layer?.layers || dxf?.tables?.layers || dxf?.layers || {};

  if (Array.isArray(layers)) {
    for (const layer of layers) {
      if (layer?.name) out[String(layer.name)] = normalizeLayer(layer);
    }
    return out;
  }

  for (const [name, layer] of Object.entries(layers || {})) {
    out[String(layer?.name || name)] = normalizeLayer({ name, ...layer });
  }
  return out;
}

export function resolveEntityStyle(entity = {}, layerTable = {}) {
  const layerName = String(entity.layer || '0');
  const layer = layerTable[layerName] || layerTable['0'] || {};
  const entityColorIndex = finiteNumber(entity.colorIndex ?? entity.colorNumber ?? entity.color, null);
  const effectiveColorIndex =
    entityColorIndex === null || entityColorIndex === 256 || entityColorIndex === 0
      ? layer.colorIndex ?? 7
      : entityColorIndex;

  return {
    layerName,
    colorIndex: effectiveColorIndex,
    color: aciToRgb(effectiveColorIndex, layer.color ?? 0xb8c4d2),
    lineType: String(entity.lineTypeName || entity.linetype || entity.lineType || layer.lineType || 'CONTINUOUS').toUpperCase(),
    lineWeight: finiteNumber(entity.lineWeight ?? entity.lineweight, layer.lineWeight ?? null),
    visible: layer.visible !== false && layer.frozen !== true,
    textHeight: finiteNumber(entity.textHeight ?? entity.height, null),
    textRotation: finiteNumber(entity.rotation ?? entity.angle, 0),
    rawColorIndex: entityColorIndex,
    source: entityColorIndex === 256 || entityColorIndex === null ? 'BYLAYER' : 'ENTITY',
  };
}
