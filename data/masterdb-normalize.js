import { createMasterDbRecord } from './masterdb-contract.js';

export function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function cleanString(value) {
  const str = String(value ?? '').trim();
  return str || '';
}

export function normalizeMasterRow(row = {}) {
  return createMasterDbRecord({
    id: row.id || crypto.randomUUID(),
    component: cleanString(row.Component || row.component).toUpperCase(),
    subtype: cleanString(row.Subtype || row.subtype).toUpperCase() || null,
    size: cleanString(row.Size || row.size),
    rating: cleanString(row.Rating || row.rating) || null,
    schedule: cleanString(row.Schedule || row.schedule) || null,
    facing: cleanString(row.Facing || row.facing).toUpperCase() || null,
    endType: cleanString(row.EndType || row.endType).toUpperCase() || null,
    angle: toFiniteNumber(row.Angle ?? row.angle),
    radiusType: cleanString(row.RadiusType || row.radiusType).toUpperCase() || null,
    centerToEnd: toFiniteNumber(row.CenterToEnd ?? row.centerToEnd),
    tangentLength: toFiniteNumber(row.TangentLength ?? row.tangentLength),
    runSize: cleanString(row.RunSize || row.runSize) || null,
    branchSize: cleanString(row.BranchSize || row.branchSize) || null,
    runCenterToEnd: toFiniteNumber(row.RunCenterToEnd ?? row.runCenterToEnd),
    branchCenterToEnd: toFiniteNumber(row.BranchCenterToEnd ?? row.branchCenterToEnd),
    standard: cleanString(row.Standard || row.standard) || null,
    boreType: cleanString(row.BoreType || row.boreType).toUpperCase() || null,
    length: toFiniteNumber(row.Length ?? row.length),
    weight: toFiniteNumber(row.Weight ?? row.weight),
    source: row.Source || row.source || 'user-masterdb',
    revision: cleanString(row.Revision || row.revision) || null,
    datasetVersion: cleanString(row.DatasetVersion || row.datasetVersion) || null,
  });
}

export function toVisibleRow(record = {}) {
  return {
    id: record.id || '',
    Component: record.component || '',
    Subtype: record.subtype || '',
    Size: record.size || '',
    Rating: record.rating || '',
    Schedule: record.schedule || '',
    EndType: record.endType || '',
    Facing: record.facing || '',
    Angle: record.angle ?? '',
    RadiusType: record.radiusType || '',
    CenterToEnd: record.centerToEnd ?? '',
    TangentLength: record.tangentLength ?? '',
    RunSize: record.runSize || '',
    BranchSize: record.branchSize || '',
    RunCenterToEnd: record.runCenterToEnd ?? '',
    BranchCenterToEnd: record.branchCenterToEnd ?? '',
    Standard: record.standard || '',
    BoreType: record.boreType || '',
    Length: record.length ?? '',
    Weight: record.weight ?? '',
    Source: record.source || '',
    Revision: record.revision || '',
    DatasetVersion: record.datasetVersion || '',
  };
}

export function normalizeQuery(query = {}) {
  return {
    component: cleanString(query.component).toUpperCase(),
    subtype: cleanString(query.subtype).toUpperCase() || null,
    size: cleanString(query.size),
    branchSize: cleanString(query.branchSize) || null,
    angle: toFiniteNumber(query.angle),
    rating: cleanString(query.rating) || null,
    schedule: cleanString(query.schedule) || null,
    endType: cleanString(query.endType).toUpperCase() || null,
    facing: cleanString(query.facing).toUpperCase() || null,
  };
}

export function buildMatchKey(record = {}) {
  return [
    record.component,
    record.subtype || '',
    record.rating || '',
    record.size || '',
    record.branchSize || '',
    record.angle || '',
    record.endType || '',
    record.facing || ''
  ].join('|');
}
