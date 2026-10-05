/**
 * formats/dxf/render/dxf-style-resolver.js
 *
 * Style and presentation resolver for DXF CAD entities.
 * Resolves BYLAYER, BYBLOCK, full 256 AutoCAD Color Index (ACI),
 * TrueColor (code 420), lineweights, linetypes, and layer visibility.
 */

// Generate the authoritative 256 AutoCAD Color Index (ACI) RGB table
function createAciTable() {
  const table = new Uint32Array(256);

  // Standard AutoCAD base colors 0..9
  table[0] = 0xffffff; // 0 = BYBLOCK (default display: white)
  table[1] = 0xff0000; // 1 = Red
  table[2] = 0xffff00; // 2 = Yellow
  table[3] = 0x00ff00; // 3 = Green
  table[4] = 0x00ffff; // 4 = Cyan
  table[5] = 0x0000ff; // 5 = Blue
  table[6] = 0xff00ff; // 6 = Magenta
  table[7] = 0xffffff; // 7 = White / Black
  table[8] = 0x414141; // 8 = Dark Gray
  table[9] = 0x808080; // 9 = Light Gray

  // HSV to RGB helper
  function hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return ((Math.round(r * 255) & 0xff) << 16) |
           ((Math.round(g * 255) & 0xff) << 8) |
           (Math.round(b * 255) & 0xff);
  }

  // ACI 10..249: 24 hues, 5 brightness levels, 2 saturation states
  const brightnessLevels = [1.0, 0.8, 0.6, 0.45, 0.3];
  for (let i = 10; i <= 249; i++) {
    const hueIndex = Math.floor(i / 10) - 1; // 0..23
    const hue = (hueIndex * 15) / 360;
    const sub = i % 10;
    const isOdd = sub % 2 === 1;
    const sat = isOdd ? 0.5 : 1.0;
    const val = brightnessLevels[Math.floor(sub / 2)];
    table[i] = hsvToRgb(hue, sat, val);
  }

  // ACI 250..255: Standard monochrome gray steps
  table[250] = 0x333333;
  table[251] = 0x505050;
  table[252] = 0x696969;
  table[253] = 0x828282;
  table[254] = 0xbebebe;
  table[255] = 0xffffff;

  return table;
}

export const DXF_ACI_RGB = createAciTable();

/**
 * Convert an ACI index (0..256) to a 24-bit numeric RGB color.
 * @param {number} aci
 * @param {number} [fallback=0xffffff]
 * @returns {number}
 */
export function aciToRgb(aci, fallback = 0xffffff) {
  const n = Number(aci);
  if (!Number.isFinite(n)) return fallback;
  const idx = Math.abs(Math.round(n));
  if (idx >= 0 && idx < 256) {
    return DXF_ACI_RGB[idx];
  }
  return fallback;
}

/**
 * Format a 24-bit integer color as CSS hex string '#RRGGBB'.
 * @param {number} rgb
 * @returns {string}
 */
export function rgbToHex(rgb) {
  const hex = (rgb & 0xffffff).toString(16).padStart(6, '0');
  return `#${hex}`;
}

/**
 * Parse an AutoCAD lineweight value (code 370) into millimeters.
 * Standard DXF values:
 * -3 = DEFAULT (returns 0.25mm)
 * -2 = BYLAYER
 * -1 = BYBLOCK
 * >= 0: hundredths of mm (e.g. 25 -> 0.25mm)
 * @param {number} rawWeight
 * @param {number} [fallback=0.25]
 * @returns {number}
 */
export function parseLineWeightMm(rawWeight, fallback = 0.25) {
  const n = Number(rawWeight);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n / 100;
}

/**
 * Resolve display styles for a DxfLayer.
 * @param {import('../model/dxf-layer.js').DxfLayer} layer
 * @returns {Object}
 */
export function resolveLayerStyle(layer) {
  if (!layer) {
    return {
      name: '0',
      colorIndex: 7,
      color: 0xffffff,
      colorHex: '#ffffff',
      colorSource: 'DEFAULT',
      lineType: 'CONTINUOUS',
      lineWeight: 0.25,
      lineWeightCode: -3,
      visible: true,
      frozen: false,
      locked: false,
      off: false,
    };
  }

  const colorIndex = layer.colorIndex ?? 7;
  const hasTrueColor = layer.trueColor != null && Number.isFinite(Number(layer.trueColor));
  const color = hasTrueColor ? Number(layer.trueColor) & 0xffffff : aciToRgb(colorIndex);

  const rawWeight = layer.lineWeight ?? -3;
  const lineWeight = rawWeight >= 0 ? rawWeight / 100 : 0.25;

  const isOff = Boolean(layer.off || colorIndex < 0);
  const isFrozen = Boolean(layer.frozen);
  const visible = !isOff && !isFrozen;

  return {
    name: layer.name || '0',
    colorIndex: Math.abs(colorIndex),
    color,
    colorHex: rgbToHex(color),
    colorSource: hasTrueColor ? 'TRUECOLOR' : 'ACI',
    lineType: String(layer.lineType || 'CONTINUOUS').toUpperCase(),
    lineWeight,
    lineWeightCode: rawWeight,
    visible,
    frozen: isFrozen,
    locked: Boolean(layer.locked),
    off: isOff,
  };
}

/**
 * Resolve effective rendering style for an entity given its document and block inheritance context.
 *
 * @param {import('../model/dxf-entity.js').DxfEntity} entity
 * @param {import('../model/dxf-document.js').DxfDocument} document
 * @param {Object} [context]
 * @param {string} [context.parentLayer]
 * @param {number} [context.parentColor]
 * @param {string} [context.parentLineType]
 * @param {number} [context.parentLineWeight]
 * @param {boolean} [context.visible]
 * @returns {Object}
 */
export function resolveEntityStyle(entity, document, context = {}) {
  const rawLayerName = String(entity?.layerId || '0');

  // Layer "0" inheritance: inside a block, layer "0" entities take the INSERT's layer
  const effectiveLayerName = (context.parentLayer && (rawLayerName === '0' || rawLayerName === ''))
    ? context.parentLayer
    : rawLayerName;

  const layer = document?.getLayer ? document.getLayer(effectiveLayerName) : null;
  const layerStyle = resolveLayerStyle(layer);

  // Visibility determination
  const entityDeleted = Boolean(entity?.state?.deleted);
  const entityOff = (entity?.style?.colorIndex != null && Number(entity.style.colorIndex) < 0) ||
                    (entity?.attributes?.invisible === true) ||
                    (entity?.source?.rawTags?.some((t) => t.code === 60 && t.value === 1));

  const isContextHidden = context.visible === false;
  const visible = !entityDeleted && !entityOff && !isContextHidden && layerStyle.visible;

  // Color resolution
  let color = 0xffffff;
  let colorSource = 'BYLAYER';
  let colorIndex = 256;

  const rawTrueColor = entity?.style?.trueColor ?? entity?.attributes?.trueColor;
  const rawColorIndex = entity?.style?.colorIndex;

  if (rawTrueColor != null && Number.isFinite(Number(rawTrueColor))) {
    // 1. Explicit 24-bit TrueColor takes top precedence
    color = Number(rawTrueColor) & 0xffffff;
    colorSource = 'TRUECOLOR';
    colorIndex = rawColorIndex != null ? Math.abs(Number(rawColorIndex)) : 256;
  } else if (rawColorIndex === 0) {
    // 2. BYBLOCK (0): Inherit parent block color, or default white
    colorSource = 'BYBLOCK';
    colorIndex = 0;
    color = context.parentColor != null ? context.parentColor : 0xffffff;
  } else if (rawColorIndex == null || rawColorIndex === 256) {
    // 3. BYLAYER (256 or unspecified): Inherit layer color
    colorSource = 'BYLAYER';
    colorIndex = layerStyle.colorIndex;
    color = layerStyle.color;
  } else {
    // 4. Explicit ACI index (1..255)
    colorIndex = Math.abs(Number(rawColorIndex));
    color = aciToRgb(colorIndex);
    colorSource = 'BYENTITY';
  }

  // Linetype resolution
  let lineType = 'CONTINUOUS';
  const rawLineType = (entity?.style?.lineType || 'BYLAYER').toUpperCase();

  if (rawLineType === 'BYBLOCK') {
    lineType = context.parentLineType || 'CONTINUOUS';
  } else if (rawLineType === 'BYLAYER') {
    lineType = layerStyle.lineType || 'CONTINUOUS';
  } else {
    lineType = rawLineType;
  }

  // Lineweight resolution
  let lineWeight = 0.25;
  let lineWeightCode = -3;
  const rawLineWeight = entity?.style?.lineWeight;
  const lineWeightMode = (entity?.style?.lineWeightMode || '').toUpperCase();

  if (lineWeightMode === 'BYLAYER' || rawLineWeight === -2 || rawLineWeight == null || rawLineWeight === -3) {
    lineWeight = layerStyle.lineWeight;
    lineWeightCode = layerStyle.lineWeightCode;
  } else if (lineWeightMode === 'BYBLOCK' || (rawLineWeight === -1 && context.inBlock)) {
    lineWeight = context.parentLineWeight != null ? context.parentLineWeight : 0.25;
    lineWeightCode = -1;
  } else if (rawLineWeight >= 0) {
    lineWeight = rawLineWeight / 100;
    lineWeightCode = rawLineWeight;
  } else {
    lineWeight = layerStyle.lineWeight;
    lineWeightCode = layerStyle.lineWeightCode;
  }

  return {
    layerName: effectiveLayerName,
    color,
    colorHex: rgbToHex(color),
    colorIndex,
    colorSource,
    lineType,
    lineWeight,
    lineWeightCode,
    visible,
    opacity: 1.0,
  };
}
