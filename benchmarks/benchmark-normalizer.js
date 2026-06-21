export const BENCHMARK_SCHEMA_VERSION = 'bm-centerline-topology/v1';
export const COORD_EPS_MM = 0.001;
export const LENGTH_EPS_MM = 0.001;
export const ANGLE_EPS_DEG = 0.01;

export const BENCHMARK_DIAGNOSTIC_CODES = Object.freeze({
  pointNotOnSegment: 'POINT_NOT_ON_SEGMENT',
  zeroLengthSegment: 'ZERO_LENGTH_SEGMENT',
  duplicateNodeId: 'DUPLICATE_NODE_ID',
  unknownSpecRef: 'UNKNOWN_SPEC_REF',
  unknownNodeRef: 'UNKNOWN_NODE_REF',
  unsupportedFeatureType: 'UNSUPPORTED_FEATURE_TYPE',
  invalidCoordinate: 'INVALID_COORDINATE',
  duplicateSegmentId: 'DUPLICATE_SEGMENT_ID',
  unknownSegmentRef: 'UNKNOWN_SEGMENT_REF',
});

const SUPPORTED_FEATURE_TYPES = new Set(['AUTO_BEND_CANDIDATE', 'FLANGE_PAIR', 'BREAK', 'AUTO_TEE_CANDIDATE']);

export function normalizeBenchmark(input, options = {}) {
  const diagnostics = [];
  const specs = normalizeSpecs(input?.specs, diagnostics);
  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  const nodes = normalizeNodes(input?.nodes, diagnostics);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const segments = normalizeSegments(input?.segments, nodeById, specById, diagnostics);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const features = normalizeFeatures(input?.features, nodeById, segmentById, specById, diagnostics);
  const supports = normalizeSupports(input?.supports, nodeById, specById, diagnostics);
  const derivedSplits = deriveSplits(features, segmentById, nodeById, diagnostics);

  return {
    id: stringValue(input?.id),
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    mode: stringValue(input?.mode).toUpperCase(),
    units: stringValue(input?.units).toUpperCase(),
    tolerances: Object.freeze({ COORD_EPS_MM, LENGTH_EPS_MM, ANGLE_EPS_DEG }),
    specs,
    nodes,
    segments,
    features,
    supports,
    derivedSplits,
    diagnostics,
    summary: summarize(nodes, segments, features, supports, diagnostics, options),
  };
}

function normalizeSpecs(rawSpecs = [], diagnostics) {
  const seen = new Set();
  const specs = [];
  for (const raw of rawSpecs) {
    const id = stringValue(raw?.id);
    if (!id) continue;
    if (seen.has(id)) pushDiagnostic(diagnostics, 'ERROR', 'DUPLICATE_SPEC_ID', `Duplicate spec ID ${id}.`, { specId: id });
    seen.add(id);
    specs.push({ id, size: stringValue(raw?.size), sch: stringValue(raw?.sch), class: stringValue(raw?.class), material: stringValue(raw?.material), standard: stringValue(raw?.standard) });
  }
  return specs;
}

function normalizeNodes(rawNodes = [], diagnostics) {
  const seen = new Set();
  const nodes = [];
  for (const raw of rawNodes) {
    const id = stringValue(raw?.id);
    if (!id) continue;
    if (seen.has(id)) pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.duplicateNodeId, `Duplicate node ID ${id}.`, { nodeId: id });
    seen.add(id);
    const node = { id, x: Number(raw?.x), y: Number(raw?.y), z: Number(raw?.z), note: stringValue(raw?.note) };
    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(node[axis])) pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.invalidCoordinate, `Node ${id} has invalid ${axis} coordinate.`, { nodeId: id, axis });
    }
    nodes.push(node.note ? node : withoutEmptyStringNote(node));
  }
  return nodes;
}

function normalizeSegments(rawSegments = [], nodeById, specById, diagnostics) {
  const seen = new Set();
  const segments = [];
  for (const raw of rawSegments) {
    const id = stringValue(raw?.id);
    const from = stringValue(raw?.from);
    const to = stringValue(raw?.to);
    const spec = stringValue(raw?.spec);
    if (!id) continue;
    if (seen.has(id)) pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.duplicateSegmentId, `Duplicate segment ID ${id}.`, { segmentId: id });
    seen.add(id);
    validateNodeRef(from, nodeById, diagnostics, { segmentId: id, role: 'from' });
    validateNodeRef(to, nodeById, diagnostics, { segmentId: id, role: 'to' });
    validateSpecRef(spec, specById, diagnostics, { segmentId: id });
    const start = nodeById.get(from);
    const end = nodeById.get(to);
    const vector = start && end ? vectorBetween(start, end) : { x: NaN, y: NaN, z: NaN };
    const lengthMm = vectorLength(vector);
    const orientation = classifyOrientation(vector, lengthMm);
    if (Number.isFinite(lengthMm) && lengthMm <= LENGTH_EPS_MM) {
      pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.zeroLengthSegment, `Segment ${id} has zero length.`, { segmentId: id, lengthMm });
    }
    segments.push({ id, from, to, spec, orientation, lengthMm, vector });
  }
  return segments;
}

function normalizeFeatures(rawFeatures = [], nodeById, segmentById, specById, diagnostics) {
  return rawFeatures.map((raw) => {
    const feature = copyFeature(raw);
    if (!SUPPORTED_FEATURE_TYPES.has(feature.type)) pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.unsupportedFeatureType, `Unsupported feature type ${feature.type}.`, { featureId: feature.id, type: feature.type });
    validateNodeRef(feature.at, nodeById, diagnostics, { featureId: feature.id, role: 'at' });
    if (feature.type === 'BREAK' && !segmentById.has(feature.onSegment)) {
      pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.unknownSegmentRef, `Feature ${feature.id} references unknown segment ${feature.onSegment}.`, { featureId: feature.id, segmentId: feature.onSegment });
    }
    for (const [key, value] of specRefsForFeature(feature)) validateSpecRef(value, specById, diagnostics, { featureId: feature.id, role: key });
    return feature;
  });
}

function normalizeSupports(rawSupports = [], nodeById, specById, diagnostics) {
  return rawSupports.map((raw) => {
    const support = { id: stringValue(raw?.id), type: stringValue(raw?.type).toUpperCase(), supportType: stringValue(raw?.supportType).toUpperCase(), at: stringValue(raw?.at), attach: stringValue(raw?.attach) };
    validateNodeRef(support.at, nodeById, diagnostics, { supportId: support.id, role: 'at' });
    if (support.spec) validateSpecRef(support.spec, specById, diagnostics, { supportId: support.id });
    return support;
  });
}

function deriveSplits(features, segmentById, nodeById, diagnostics) {
  const splits = [];
  for (const feature of features.filter((item) => item.type === 'BREAK')) {
    const segment = segmentById.get(feature.onSegment);
    const point = nodeById.get(feature.at);
    if (!segment || !point) continue;
    const start = nodeById.get(segment.from);
    const end = nodeById.get(segment.to);
    if (!isPointOnSegment(point, start, end)) {
      pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.pointNotOnSegment, `Break ${feature.id} is not on segment ${segment.id}.`, { featureId: feature.id, nodeId: feature.at, segmentId: segment.id });
      continue;
    }
    splits.push({
      featureId: feature.id,
      segmentId: segment.id,
      atNode: feature.at,
      spans: [
        { from: segment.from, to: feature.at, lengthMm: distance(start, point) },
        { from: feature.at, to: segment.to, lengthMm: distance(point, end) },
      ],
    });
  }
  return splits;
}

function summarize(nodes, segments, features, supports, diagnostics) {
  const featureCounts = {};
  for (const feature of features) featureCounts[feature.type] = (featureCounts[feature.type] || 0) + 1;
  return {
    nodeCount: nodes.length,
    originalSegmentCount: segments.length,
    featureCount: features.length,
    featureCounts,
    supportCount: supports.length,
    structuralDiagnosticCount: diagnostics.length,
    structuralValid: diagnostics.every((diagnostic) => diagnostic.severity !== 'ERROR'),
  };
}

function copyFeature(raw) {
  const feature = { ...raw };
  feature.id = stringValue(raw?.id);
  feature.type = stringValue(raw?.type).toUpperCase();
  feature.at = stringValue(raw?.at);
  feature.spec = stringValue(raw?.spec);
  feature.runSpec = stringValue(raw?.runSpec);
  feature.branchSpec = stringValue(raw?.branchSpec);
  feature.onSegment = stringValue(raw?.onSegment);
  return feature;
}

function specRefsForFeature(feature) {
  if (feature.type === 'AUTO_TEE_CANDIDATE') return [['runSpec', feature.runSpec], ['branchSpec', feature.branchSpec]];
  if (feature.spec) return [['spec', feature.spec]];
  return [];
}

function validateNodeRef(nodeId, nodeById, diagnostics, details) {
  if (!nodeId || !nodeById.has(nodeId)) pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.unknownNodeRef, `Unknown node reference ${nodeId}.`, { ...details, nodeId });
}

function validateSpecRef(specId, specById, diagnostics, details) {
  if (!specId || !specById.has(specId)) pushDiagnostic(diagnostics, 'ERROR', BENCHMARK_DIAGNOSTIC_CODES.unknownSpecRef, `Unknown spec reference ${specId}.`, { ...details, specId });
}

function classifyOrientation(vector, lengthMm) {
  if (!Number.isFinite(lengthMm) || lengthMm <= LENGTH_EPS_MM) return 'ZERO';
  const active = ['x', 'y', 'z'].filter((axis) => Math.abs(vector[axis]) > COORD_EPS_MM);
  return active.length === 1 ? active[0].toUpperCase() : 'SKEW';
}

function isPointOnSegment(point, start, end) {
  const total = distance(start, end);
  if (!Number.isFinite(total) || total <= LENGTH_EPS_MM) return false;
  const split = distance(start, point) + distance(point, end);
  return Math.abs(split - total) <= LENGTH_EPS_MM && withinBounds(point, start, end);
}

function withinBounds(point, start, end) {
  return ['x', 'y', 'z'].every((axis) => {
    const min = Math.min(start[axis], end[axis]) - COORD_EPS_MM;
    const max = Math.max(start[axis], end[axis]) + COORD_EPS_MM;
    return point[axis] >= min && point[axis] <= max;
  });
}

function distance(a, b) {
  return vectorLength(vectorBetween(a, b));
}

function vectorBetween(a, b) {
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function pushDiagnostic(diagnostics, severity, code, message, details = {}) {
  diagnostics.push({ severity, code, message, details });
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}

function withoutEmptyStringNote(node) {
  const { note, ...rest } = node;
  return rest;
}
