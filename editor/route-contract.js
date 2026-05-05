/**
 * editor/route-contract.js
 * Canonical route model contract for AI-2.
 */
export const ROUTE_CONTRACT_VERSION = '1.0.0-wave0';

export function createRouteNode(id, x, y, z) {
  return { id, x, y, z };
}

export function createRouteSegment(id, from, to, kind = 'PIPE', orientation = 'HORIZONTAL') {
  return { id, from, to, kind, orientation };
}

export function createEmptyRoute(id, spec = {}) {
  return {
    contractVersion: ROUTE_CONTRACT_VERSION,
    id,
    nodes: [],
    segments: [],
    spec,
  };
}

export function validateRouteShape(route) {
  return !!route && Array.isArray(route.nodes) && Array.isArray(route.segments);
}
