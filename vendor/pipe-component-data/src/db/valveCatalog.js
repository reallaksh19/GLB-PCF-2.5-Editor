import { splitCsvRows } from '../sourceParsers/csvCells.js';

export function valveKey(row) {
  return [
    'VALVE',
    row.valveType,
    row.endType,
    `NPS${row.nps}`,
    `CL${row.classRating}`,
    row.facing,
  ].join('|');
}

const normHeader = (h) => {
  if (h === 'RTJ-F/F') return 'RTJ F/F';
  if (h === 'RTJ Addition') return 'RTJ Add Len';
  if (h === 'RTJ Gap') return 'gap';
  return h;
};

export function parseValveTable(text, options = {}) {
  const rows = splitCsvRows(text);
  const headers = (rows[1] ?? []).map(normHeader);
  return rows.slice(2).map((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, clean(cells[columnIndex])]));
    return makeValveRow(raw, {
      ...options,
      sourceRowNumber: index + 3,
      sourceColumns: headers.length,
    });
  });
}

export function buildValveIndex(rows) {
  const index = {};
  const duplicates = [];
  for (const row of rows) {
    const key = valveKey(row);
    if (index[key]) duplicates.push(key);
    index[key] = row.id;
  }
  return { index, duplicates };
}

export function lookupValveRecord(rows, query) {
  const key = valveKey(query);
  const hit = rows.find((row) => valveKey(row) === key);
  return hit ? { ok: true, row: hit, matchKey: key } : { ok: false, code: 'VALVE_LOOKUP_MISS', query };
}

function makeValveRow(raw, options) {
  const base = {
    componentType: 'VALVE',
    valveType: options.valveType ?? 'GATE',
    endType: options.endType ?? 'FLANGED',
    classRating: String(options.classRating ?? '150'),
    facing: options.facing ?? 'RF',
    standard: options.standard ?? 'ASME B16.10',
    source: options.source ?? 'docs/Pipedata/Database/Vlfl/VLV1150.csv',
    datasetVersion: options.datasetVersion ?? 'pipedata-db/2026.06.phase7',
    dataStatus: 'READY',
  };
  const row = {
    ...base,
    nps: String(raw.NPS),
    dn: numberOrNull(raw.DN),
    sourceRowNumber: options.sourceRowNumber,
    dimensions: {
      faceToFaceRfMm: taggedNumber(raw['RF-F/F'], 'RF-F/F'),
      faceToFaceRtjMm: taggedNumber(raw['RTJ F/F'], 'RTJ F/F'),
      buttWeldLengthMm: taggedNumber(raw['BW-F/F'], 'BW-F/F'),
      heightMm: taggedNumber(raw['Height-HW'], 'Height-HW'),
      handwheelDiaMm: taggedNumber(raw['Diam-HW'], 'Diam-HW'),
      rtjAddLengthMm: taggedNumber(raw['RTJ Add Len'], 'RTJ Add Len'),
      gapMm: taggedNumber(raw.gap, 'gap'),
    },
    weights: {
      rfRtjKg: taggedNumber(raw['RF/RTJ KG'], 'RF/RTJ KG'),
      buttWeldKg: taggedNumber(raw['BW KG'], 'BW KG'),
    },
    provenance: provenance(base, options.sourceRowNumber),
  };
  row.id = valveKey(row);
  row.dataStatus = hasUnavailable(row) ? 'PARTIAL' : 'READY';
  return row;
}

function provenance(row, sourceRowNumber) {
  return {
    standard: row.standard,
    source: row.source,
    datasetVersion: row.datasetVersion,
    dataStatus: row.dataStatus,
    sourceRowNumber,
  };
}

function taggedNumber(value, sourceColumn) {
  const parsed = numberOrNull(value);
  return parsed === null
    ? { value: null, basis: 'UNAVAILABLE', sourceColumn }
    : { value: parsed, basis: 'SOURCE_VALUE', sourceColumn, unit: sourceColumn.includes('KG') ? 'kg' : 'mm' };
}

function hasUnavailable(row) {
  const tagged = [...Object.values(row.dimensions), ...Object.values(row.weights)];
  return tagged.some((item) => item.basis === 'UNAVAILABLE');
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text === '' || text === 'N/A' || text === 'SPA' ? null : text;
}

function numberOrNull(value) {
  const cleaned = clean(value);
  if (cleaned === null) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}
