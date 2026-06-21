import { COORD_EPS_MM, normalizeBenchmark } from './benchmark-normalizer.js';

export const PIPE_LIST_SCHEMA_VERSION = 'bm-explicit-pipe-list/v1';
export const PIPE_LIST_DIAGNOSTIC_CODES = Object.freeze({
  duplicatePointIdConflict: 'PIPE_LIST_DUPLICATE_POINT_ID_CONFLICT',
  duplicatePointIdSnapped: 'PIPE_LIST_DUPLICATE_POINT_ID_SNAPPED',
  missingPipeEndpoint: 'PIPE_LIST_MISSING_PIPE_ENDPOINT',
});

export function normalizePipeListBenchmark(pipeList, options = {}) {
  const conversion = pipeListToBenchmarkGraph(pipeList, options);
  return {
    sourceSchemaVersion: PIPE_LIST_SCHEMA_VERSION,
    graph: conversion.graph,
    pipeListDiagnostics: conversion.diagnostics,
    canonical: normalizeBenchmark(conversion.graph, options),
  };
}

export function pipeListToBenchmarkGraph(pipeList, options = {}) {
  const diagnostics = [];
  const points = new Map();
  const pipes = Array.isArray(pipeList?.pipes) ? pipeList.pipes : [];
  const additionalNodes = Array.isArray(pipeList?.additionalNodes) ? pipeList.additionalNodes : [];

  for (const pipe of pipes) {
    collectEndpoint(points, pipe?.from, diagnostics, { pipeId: pipe?.id, role: 'from' });
    collectEndpoint(points, pipe?.to, diagnostics, { pipeId: pipe?.id, role: 'to' });
  }
  for (const node of additionalNodes) collectEndpoint(points, node, diagnostics, { role: 'additionalNode' });

  return {
    diagnostics,
    graph: {
      id: options.id || pipeList?.benchmarkId || pipeList?.id || '',
      mode: pipeList?.mode || 'CENTERLINE',
      units: pipeList?.units || 'MM',
      specs: cloneArray(pipeList?.specs),
      nodes: [...points.values()].map(({ point }) => point),
      segments: pipes.map((pipe) => ({ id: stringValue(pipe?.id), from: pointId(pipe?.from), to: pointId(pipe?.to), spec: stringValue(pipe?.spec), line: stringValue(pipe?.line) })).map(withoutEmptyLine),
      features: cloneArray(pipeList?.features),
      supports: cloneArray(pipeList?.supports),
    },
  };
}

function collectEndpoint(points, rawPoint, diagnostics, details) {
  const id = pointId(rawPoint);
  if (!id) {
    diagnostics.push({ severity: 'ERROR', code: PIPE_LIST_DIAGNOSTIC_CODES.missingPipeEndpoint, message: 'Pipe-list point is missing an ID.', details });
    return;
  }
  const point = normalizePoint(rawPoint);
  const previous = points.get(id);
  if (!previous) {
    points.set(id, { point, sources: [details] });
    return;
  }
  const delta = coordinateDelta(previous.point, point);
  if (delta <= COORD_EPS_MM) {
    diagnostics.push({ severity: 'INFO', code: PIPE_LIST_DIAGNOSTIC_CODES.duplicatePointIdSnapped, message: `Point ${id} reused within coordinate tolerance.`, details: { ...details, nodeId: id, deltaMm: delta, toleranceMm: COORD_EPS_MM } });
    return;
  }
  diagnostics.push({ severity: 'ERROR', code: PIPE_LIST_DIAGNOSTIC_CODES.duplicatePointIdConflict, message: `Point ${id} has conflicting coordinates.`, details: { ...details, nodeId: id, deltaMm: delta, toleranceMm: COORD_EPS_MM, first: previous.point, next: point } });
}

function normalizePoint(rawPoint) {
  return { id: pointId(rawPoint), x: Number(rawPoint?.x), y: Number(rawPoint?.y), z: Number(rawPoint?.z) };
}

function coordinateDelta(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pointId(rawPoint) {
  return stringValue(rawPoint?.id ?? rawPoint?.nodeId);
}

function cloneArray(value) {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : [];
}

function withoutEmptyLine(segment) {
  const { line, ...rest } = segment;
  return line ? segment : rest;
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}
