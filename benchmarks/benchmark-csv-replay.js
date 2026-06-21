import { executeMacroScriptReport } from '../macro/macro-engine.js';

export const BENCHMARK_CSV_SCHEMA_VERSION = 'bm-csv-command-replay/v1';

export function parseBenchmarkCsv(text = '') {
  const rows = String(text || '').split(/\r\n|\n|\r/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  if (!rows.length) return [];
  const headers = splitCsvLine(rows[0]).map((item) => item.trim());
  return rows.slice(1).map((line, index) => Object.fromEntries(headers.map((header, column) => [header, splitCsvLine(line)[column] ?? '']))).map((row, index) => ({ ...row, __line: index + 2 }));
}

export function executeBenchmarkCsvReplay(csvText, context = {}, options = {}) {
  return executeBenchmarkRows(parseBenchmarkCsv(csvText), context, options);
}

export function executeBenchmarkRows(rows = [], context = {}, options = {}) {
  const results = [];
  const macroLines = [];
  const routeEngine = context.getRouteEngine?.();

  for (const row of rows) {
    const command = commandName(row);
    if (!command) continue;
    if (command === 'POLYLINE') {
      if (!routeEngine) throw new Error('POLYLINE CSV replay requires route engine context');
      const routeId = value(row, 'routeId', 'route');
      const points = parsePointList(value(row, 'points'));
      const spec = specFromRow(row);
      routeEngine.createPolyline(points, spec, { routeId, source: 'benchmark-csv-replay', csvLine: row.__line });
      results.push({ ok: true, line: row.__line, command, routeId, pointCount: points.length });
      continue;
    }
    const macroLine = macroLineFromRow(row);
    macroLines.push(macroLine);
    results.push({ ok: true, line: row.__line, command, macroLine });
  }

  const macroScript = macroLines.join('\n');
  const macroReport = macroScript ? executeMacroScriptReport(macroScript, context, { sourceName: options.sourceName || 'benchmark-csv-replay', stopOnError: options.stopOnError !== false }) : null;
  return {
    schemaVersion: BENCHMARK_CSV_SCHEMA_VERSION,
    rows: rows.length,
    routedRows: results.filter((result) => result.command === 'POLYLINE').length,
    macroRows: macroLines.length,
    macroScript,
    results,
    macroReport,
    ok: !macroReport || macroReport.ok,
  };
}

export function csvRowsToMacroScript(csvText) {
  return parseBenchmarkCsv(csvText).filter((row) => commandName(row) !== 'POLYLINE').map(macroLineFromRow).join('\n');
}

function commandName(row) {
  return String(value(row, 'command', 'cmd', 'type') || '').trim().toUpperCase();
}

function macroLineFromRow(row) {
  const command = commandName(row);
  const args = value(row, 'args', 'arguments');
  if (args) return `${command} ${args}`.trim();
  const at = value(row, 'at', 'point');
  const route = value(row, 'routeId', 'route');
  const segment = value(row, 'segmentId', 'segment');
  const opts = Object.entries(row).filter(([key, val]) => !ignoredMacroKey(key) && val !== '').map(([key, val]) => `${toMacroKey(key)}=${val}`);
  return [command, at, route ? `ROUTE=${route}` : '', segment ? `SEGMENT=${segment}` : '', ...opts].filter(Boolean).join(' ');
}

function specFromRow(row) {
  return withoutEmptyValues({
    pipelineRef: value(row, 'pipelineRef', 'pipeline'),
    pipeline: value(row, 'pipeline'),
    size: value(row, 'size', 'nps'),
    nominalSize: value(row, 'nominalSize', 'size', 'nps'),
    sch: value(row, 'sch', 'schedule'),
    schedule: value(row, 'schedule', 'sch'),
    rating: value(row, 'rating', 'class'),
    class: value(row, 'class', 'rating'),
    material: value(row, 'material', 'mat'),
  });
}

function value(row, ...keys) {
  const exact = keys.find((key) => row[key] != null && row[key] !== '');
  if (exact) return row[exact];
  const lookup = Object.fromEntries(Object.entries(row).map(([key, val]) => [key.toLowerCase(), val]));
  const found = keys.find((key) => lookup[key.toLowerCase()] != null && lookup[key.toLowerCase()] !== '');
  return found ? lookup[found.toLowerCase()] : '';
}

function parsePointList(text) {
  const rawPoints = String(text || '').split('|').map((item) => item.trim()).filter(Boolean);
  if (rawPoints.length < 2) throw new Error('POLYLINE CSV row requires at least two points separated by |');
  return rawPoints.map(parsePoint);
}

function parsePoint(text) {
  const parts = String(text || '').split(',').map((item) => Number(item.trim()));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) throw new Error(`Invalid point: ${text}`);
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function splitCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const char of String(line || '')) {
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { cells.push(cell); cell = ''; continue; }
    cell += char;
  }
  cells.push(cell);
  return cells.map((item) => item.trim());
}

function ignoredMacroKey(key) {
  return new Set(['__line', 'command', 'cmd', 'type', 'args', 'arguments', 'at', 'point', 'route', 'routeId', 'segment', 'segmentId']).has(key);
}

function toMacroKey(key) {
  return String(key).replace(/[A-Z]/g, (match) => `_${match}`).replace(/-/g, '_').toUpperCase();
}

function withoutEmptyValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, val]) => val !== undefined && val !== null && val !== ''));
}
