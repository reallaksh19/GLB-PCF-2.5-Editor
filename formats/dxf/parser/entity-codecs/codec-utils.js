/** Native common fields are scoped to the entity base subclass, excluding reactors/XDATA. */
export function parseCommonFields(tags) {
  const first = code => tags.find(t => t.code === code)?.value ?? null;
  const baseStart = tags.findIndex(t => t.code === 100 && t.value.trim() === 'AcDbEntity');
  let fields = tags;
  if (baseStart >= 0) {
    const next = tags.findIndex((t, i) => i > baseStart && t.code === 100);
    fields = tags.slice(baseStart + 1, next < 0 ? tags.length : next);
  }
  const field = (code, fallback) => fields.find(t => t.code === code)?.value ?? fallback;
  const handle = first(5) ?? first(105);
  const ownerHandle = first(330);
  const layoutId = field(410, null);
  const colorIndex = Number(field(62, 256));
  const trueColorValue = field(420, null);
  const trueColor = trueColorValue === null ? null : Number(trueColorValue);
  const lineType = field(6, 'BYLAYER');
  const lineWeight = Number(field(370, -1));
  const transparency = field(440, null);
  const colorMode = trueColor !== null ? 'TRUECOLOR' : colorIndex === 0 ? 'BYBLOCK' : colorIndex === 256 ? 'BYLAYER' : 'INDEX';
  return {
    handle: handle === null ? null : handle.trim().toUpperCase(),
    ownerHandle: ownerHandle === null ? null : ownerHandle.trim().toUpperCase(),
    layerId: field(8, '0'),
    layoutId,
    space: Number(field(67, 0)) === 1 || (layoutId !== null && layoutId.trim().toUpperCase() !== 'MODEL') ? 'paper' : 'model',
    style: {
      colorMode, colorIndex, trueColor,
      lineTypeMode: lineType.toUpperCase() === 'BYLAYER' ? 'BYLAYER' : lineType.toUpperCase() === 'BYBLOCK' ? 'BYBLOCK' : 'EXPLICIT',
      lineType,
      lineWeightMode: lineWeight === -1 ? 'BYLAYER' : lineWeight === -2 ? 'BYBLOCK' : lineWeight === -3 ? 'DEFAULT' : 'EXPLICIT',
      lineWeight,
      transparency: transparency === null ? null : Number(transparency),
    },
  };
}
export function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const trimmed = String(value).trim();
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
}
