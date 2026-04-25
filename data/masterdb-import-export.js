import { normalizeMasterRow, toVisibleRow } from './masterdb-normalize.js';

function escapeCsvValue(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
  return str;
}

export function exportMasterDbCsv(rows = []) {
  const visible = rows.map(toVisibleRow);
  const headers = [
    'Component', 'Subtype', 'Size', 'Rating', 'Schedule', 'EndType', 'Facing',
    'Angle', 'RadiusType', 'CenterToEnd', 'TangentLength', 'RunSize', 'BranchSize',
    'RunCenterToEnd', 'BranchCenterToEnd', 'Standard', 'BoreType', 'Length', 'Weight',
    'Source', 'Revision', 'DatasetVersion'
  ];
  const lines = [headers.join(',')];
  for (const row of visible) {
    lines.push(headers.map((h) => escapeCsvValue(row[h])).join(','));
  }
  return lines.join('\n');
}

export function exportMasterDbJson(rows = []) {
  return JSON.stringify(rows.map(normalizeMasterRow), null, 2);
}

export function importMasterDbJson(text = '') {
  const parsed = JSON.parse(String(text || '[]'));
  if (!Array.isArray(parsed)) throw new Error('Master DB JSON must be an array');
  return parsed.map(normalizeMasterRow);
}
