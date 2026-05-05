export function formatMm(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num)} mm`;
}

export function formatPt(pt) {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) return '—';
  return `X=${Math.round(pt.x)} Y=${Math.round(pt.y)} Z=${Math.round(pt.z)}`;
}

export function toPositiveNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function clampLength(value, fallback = 1000) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function formatProvenanceLabel(source) {
  switch (String(source || '').toLowerCase()) {
    case 'master-db':
    case 'db':
      return 'DB';
    case 'fallback':
      return 'Fallback';
    case 'manual':
      return 'Manual';
    case 'default':
      return 'Default';
    default:
      return source || 'Unknown';
  }
}
