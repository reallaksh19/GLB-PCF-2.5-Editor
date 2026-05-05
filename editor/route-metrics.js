/**
 * editor/route-metrics.js
 * Route measurement and orientation helpers for AI-2.
 */

import { boundsFromPoints, deltaBetween, normalizePoint } from './coordinate-normalizer.js';

const ORIENTATION_EPS = 1e-6;

export function classifySegmentOrientation(from, to) {
  const { dx, dy, dz } = deltaBetween(from, to);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);

  if (ax <= ORIENTATION_EPS && ay <= ORIENTATION_EPS && az <= ORIENTATION_EPS) return 'ZERO';
  if (az > ORIENTATION_EPS && ax <= ORIENTATION_EPS && ay <= ORIENTATION_EPS) return 'VERTICAL';
  if (az <= ORIENTATION_EPS) return 'HORIZONTAL';
  return 'SPATIAL';
}

export function segmentLength3D(seg, nodeIndex) {
  const a = normalizePoint(nodeIndex[seg.from]);
  const b = normalizePoint(nodeIndex[seg.to]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function routeNodeIndex(route) {
  const index = {};
  for (const node of route?.nodes || []) {
    index[node.id] = normalizePoint(node);
  }
  return index;
}

export function routeMetrics(route) {
  const nodeIndex = routeNodeIndex(route);
  let totalLength = 0;
  let verticalLength = 0;
  let horizontalLength = 0;
  let spatialLength = 0;
  const orientations = {};

  for (const seg of route?.segments || []) {
    const orientation = seg.orientation || classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
    const len = segmentLength3D(seg, nodeIndex);
    totalLength += len;
    orientations[orientation] = (orientations[orientation] || 0) + 1;
    if (orientation === 'VERTICAL') verticalLength += len;
    else if (orientation === 'HORIZONTAL') horizontalLength += len;
    else if (orientation === 'SPATIAL') spatialLength += len;
  }

  return {
    routeId: route?.id || null,
    nodeCount: route?.nodes?.length || 0,
    segmentCount: route?.segments?.length || 0,
    totalLength,
    verticalLength,
    horizontalLength,
    spatialLength,
    orientations,
    bounds: boundsFromPoints(route?.nodes || []),
  };
}

export function aggregateRouteMetrics(routes = []) {
  const perRoute = routes.map(routeMetrics);
  return {
    routeCount: perRoute.length,
    totalLength: perRoute.reduce((sum, item) => sum + item.totalLength, 0),
    verticalLength: perRoute.reduce((sum, item) => sum + item.verticalLength, 0),
    horizontalLength: perRoute.reduce((sum, item) => sum + item.horizontalLength, 0),
    spatialLength: perRoute.reduce((sum, item) => sum + item.spatialLength, 0),
    perRoute,
  };
}
