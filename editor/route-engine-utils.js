import { createRouteNode, createRouteSegment } from './route-contract.js';
import { applyDelta, clonePoint, normalizeAxisDelta, normalizePoint, pointsEqual } from './coordinate-normalizer.js';
import { aggregateRouteMetrics, classifySegmentOrientation, routeNodeIndex } from './route-metrics.js';

export const uid = (prefix) => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
export function parseBore(spec = {}) {
  const candidate = spec.bore ?? spec.size ?? spec.nominalSize ?? 100;
  const match = String(candidate).match(/-?\d+(?:\.\d+)?/);
  const num = match ? Number(match[0]) : Number(candidate);
  return Number.isFinite(num) ? Math.max(num, 25) : 100;
}
export const getRouteIndex = (state, routeId) => (state.model?.routes || []).findIndex((route) => route.id === routeId);
export function getRouteOrThrow(state, routeId) {
  const index = getRouteIndex(state, routeId || state.selection?.activeRouteId);
  if (index < 0) throw new Error(`Route not found: ${routeId || state.selection?.activeRouteId || 'unknown'}`);
  return { index, route: state.model.routes[index] };
}
export function buildDiagnostics(state, routeId, commandType) {
  const metrics = aggregateRouteMetrics(state.model.routes || []);
  return { traces: [...(state.diagnostics?.traces || [])], metrics: { ...(state.diagnostics?.metrics || {}), routes: metrics, lastRouteId: routeId || null, lastCommandType: commandType } };
}
export function patchStateWithRoute(state, nextRoutes, routeId, commandType, extra = {}) {
  return {
    model: { ...(state.model || {}), routes: nextRoutes, components: extra.modelComponents ?? state.model?.components ?? [] },
    selection: { ...(state.selection || {}), activeRouteId: routeId || state.selection?.activeRouteId || null, ids: routeId ? [routeId] : (state.selection?.ids || []) },
    diagnostics: buildDiagnostics({ ...state, model: { ...(state.model || {}), routes: nextRoutes } }, routeId, commandType),
  };
}
export function resolveTargetPoint(route, payload = {}) {
  const lastNode = route.nodes[route.nodes.length - 1];
  if (!lastNode) throw new Error('Route has no nodes');
  if (payload.to && typeof payload.to === 'object') return normalizePoint(payload.to);
  if (payload.absolute && typeof payload.absolute === 'object') return normalizePoint(payload.absolute);
  if (['x', 'y', 'z'].some((key) => payload[key] != null) && payload.useAbsolute === true) return normalizePoint({ x: payload.x, y: payload.y, z: payload.z });
  return applyDelta(lastNode, normalizeAxisDelta({ dx: payload.dx, dy: payload.dy, dz: payload.dz }));
}
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const directionVector = (a, b) => ({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
const crossMagnitude = (u, v) => Math.sqrt((u.y * v.z - u.z * v.y) ** 2 + (u.z * v.x - u.x * v.z) ** 2 + (u.x * v.y - u.y * v.x) ** 2);
function calculateBendAngle(a, b, c) {
  const u = directionVector(a, b), v = directionVector(b, c);
  const magU = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z), magV = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (magU <= 0.001 || magV <= 0.001) return 0;
  const cosTheta = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (magU * magV)));
  let angleDeg = Math.acos(cosTheta) * (180 / Math.PI);
  if (Math.abs(angleDeg - 90) < 1) angleDeg = 90;
  else if (Math.abs(angleDeg - 45) < 1) angleDeg = 45;
  return angleDeg;
}
const calculateBendTrim = (length, angleDeg) => (angleDeg <= 0 || angleDeg >= 180 ? length : length * Math.tan((angleDeg * Math.PI / 180) / 2));
function orthogonalElbowControl(prevNode, cornerNode, nextNode, length = null) {
  const inVec = directionVector(prevNode, cornerNode), outVec = directionVector(cornerNode, nextNode);
  const inMag = Math.sqrt(inVec.x ** 2 + inVec.y ** 2 + inVec.z ** 2) || 1, outMag = Math.sqrt(outVec.x ** 2 + outVec.y ** 2 + outVec.z ** 2) || 1;
  const trim = Math.min(inMag, outMag, calculateBendTrim(Number.isFinite(Number(length)) && Number(length) > 0 ? Number(length) : 250, calculateBendAngle(prevNode, cornerNode, nextNode)));
  return {
    ep1: { x: cornerNode.x - (inVec.x / inMag) * trim, y: cornerNode.y - (inVec.y / inMag) * trim, z: cornerNode.z - (inVec.z / inMag) * trim },
    cp: clonePoint(cornerNode),
    ep2: { x: cornerNode.x + (outVec.x / outMag) * trim, y: cornerNode.y + (outVec.y / outMag) * trim, z: cornerNode.z + (outVec.z / outMag) * trim },
  };
}
export const ensureRouteFlags = (route) => { route.convertedBendNodes ||= []; route.convertedTeeNodes ||= []; return route; };
export const isSamePoint = (a, b, eps = 0.001) => !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
function isTurnBetween(nodeIndex, prevSeg, nextSeg, eps = 0.001) {
  if (!prevSeg || !nextSeg) return false;
  const a = nodeIndex[prevSeg.from], b = nodeIndex[prevSeg.to], c = nodeIndex[nextSeg.to];
  if (!a || !b || !c) return false;
  const u = directionVector(a, b), v = directionVector(b, c);
  const magU = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z), magV = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return magU > eps && magV > eps && crossMagnitude(u, v) > eps;
}
const findPrevNextSegments = (route, nodeId) => ({ prevSeg: (route.segments || []).find((seg) => seg.to === nodeId) || null, nextSeg: (route.segments || []).find((seg) => seg.from === nodeId) || null });
export function routeBendCandidate(route, preferredNodeId = null) {
  const nodeIndex = routeNodeIndex(route);
  const candidates = preferredNodeId ? (route.nodes || []).filter((node) => node.id === preferredNodeId) : (route.nodes || []).slice(1, -1);
  for (const node of candidates) {
    if ((route.convertedBendNodes || []).includes(node.id)) continue;
    const { prevSeg, nextSeg } = findPrevNextSegments(route, node.id);
    if (!prevSeg || !nextSeg || !isTurnBetween(nodeIndex, prevSeg, nextSeg)) continue;
    return { routeId: route.id, nodeId: node.id, cornerPoint: clonePoint(node), prevSegId: prevSeg.id, nextSegId: nextSeg.id, prevSeg, nextSeg, size: route.spec?.size || route.spec?.nominalSize || '', rating: route.spec?.rating || '', angle: calculateBendAngle(nodeIndex[prevSeg.from], nodeIndex[prevSeg.to], nodeIndex[nextSeg.to]) };
  }
  return null;
}
function isPointOnSegment(p, a, b, eps = 0.001) {
  const crossX = (p.y - a.y) * (b.z - a.z) - (p.z - a.z) * (b.y - a.y);
  const crossY = (p.z - a.z) * (b.x - a.x) - (p.x - a.x) * (b.z - a.z);
  const crossZ = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  if (Math.abs(crossX) > eps || Math.abs(crossY) > eps || Math.abs(crossZ) > eps) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y) + (p.z - a.z) * (b.z - a.z);
  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2;
  return dot >= -eps && dot <= lenSq + eps;
}
export function routeTeeCandidate(routes, targetRoute, preferredNodeId = null) {
  const nodes = preferredNodeId ? (targetRoute.nodes || []).filter((node) => node.id === preferredNodeId) : (targetRoute.nodes || []);
  const targetNodeIndex = routeNodeIndex(targetRoute);
  for (const node of nodes) {
    if ((targetRoute.convertedTeeNodes || []).includes(node.id)) continue;
    const { prevSeg, nextSeg } = findPrevNextSegments(targetRoute, node.id);
    for (const otherRoute of routes || []) {
      if (!otherRoute || otherRoute.id === targetRoute.id) continue;
      const otherNode = (otherRoute.nodes || []).find((item) => isSamePoint(item, node));
      if (!otherNode) continue;
      const otherSeg = (otherRoute.segments || []).find((seg) => seg.from === otherNode.id || seg.to === otherNode.id) || null;
      if (!otherSeg || (!prevSeg && !nextSeg)) continue;
      return { routeId: targetRoute.id, nodeId: node.id, branchRouteId: otherRoute.id, point: clonePoint(node), runSize: targetRoute.spec?.size || '', branchSize: otherRoute.spec?.size || targetRoute.spec?.size || '', rating: targetRoute.spec?.rating || otherRoute.spec?.rating || '', subtype: (otherRoute.spec?.size || '') && String(otherRoute.spec?.size) !== String(targetRoute.spec?.size || '') ? 'REDUCING' : 'EQUAL', prevSeg, nextSeg, branchSeg: otherSeg, nodeIndex: targetNodeIndex, isMidSegmentSplit: false };
    }
  }
  for (const seg of targetRoute.segments || []) {
    const a = targetNodeIndex[seg.from], b = targetNodeIndex[seg.to];
    if (!a || !b) continue;
    for (const otherRoute of routes || []) for (const otherNode of otherRoute?.nodes || []) {
      if (!otherRoute || otherRoute.id === targetRoute.id || !isPointOnSegment(otherNode, a, b)) continue;
      const otherSeg = (otherRoute.segments || []).find((s) => s.from === otherNode.id || s.to === otherNode.id) || null;
      if (otherSeg) return { routeId: targetRoute.id, nodeId: null, intersectedSegment: seg, branchRouteId: otherRoute.id, point: clonePoint(otherNode), runSize: targetRoute.spec?.size || '', branchSize: otherRoute.spec?.size || targetRoute.spec?.size || '', rating: targetRoute.spec?.rating || otherRoute.spec?.rating || '', subtype: (otherRoute.spec?.size || '') && String(otherRoute.spec?.size) !== String(targetRoute.spec?.size || '') ? 'REDUCING' : 'EQUAL', prevSeg: null, nextSeg: null, branchSeg: otherSeg, nodeIndex: targetNodeIndex, isMidSegmentSplit: true };
    }
  }
  return null;
}
export function buildAutoBendPayload(route, candidate, resolved = {}, payload = {}) {
  const nodeIndex = routeNodeIndex(route), prevSeg = (route.segments || []).find((seg) => seg.id === candidate.prevSegId) || candidate.prevSeg, nextSeg = (route.segments || []).find((seg) => seg.id === candidate.nextSegId) || candidate.nextSeg;
  const prevNode = clonePoint(nodeIndex[prevSeg.from]), cornerNode = clonePoint(nodeIndex[prevSeg.to]), nextNode = clonePoint(nodeIndex[nextSeg.to]);
  const elbow = orthogonalElbowControl(prevNode, cornerNode, nextNode, resolved.length || payload.length);
  return { id: `route:${route.id}:auto-bend:${candidate.nodeId}`, routeId: route.id, component: 'ELBOW', point: cornerNode, origin: cornerNode, ep1: elbow.ep1, ep2: elbow.ep2, cp: elbow.cp, subtype: resolved.subtype || payload.subtype || payload.radiusType || 'LR', size: resolved.size || payload.size || route.spec?.size || '', rating: resolved.rating || payload.rating || route.spec?.rating || '', angle: resolved.angle || payload.angle || 90, length: resolved.centerToEnd || resolved.length || payload.length || '', weight: resolved.weight || payload.weight || '', provenance: payload.provenance || 'manual', matchKey: payload.matchKey || '', pipelineRef: route.spec?.pipelineRef || route.spec?.pipeline || 'ROUTE-AUTHORED' };
}
export function buildAutoTeePayload(routes, route, candidate, resolved = {}, payload = {}) {
  const nodeIndex = routeNodeIndex(route), point = clonePoint(nodeIndex[candidate.nodeId]), runLen = resolved.length || payload.length || 0, branchLen = payload.branchLength || resolved.branchLength || runLen;
  let runFrom = clonePoint(point), runTo = clonePoint(point), bp = clonePoint(point);
  if (candidate.prevSeg) {
    const origFrom = clonePoint(nodeIndex[candidate.prevSeg.from]);
    const inVec = directionVector(origFrom, point), inMag = Math.sqrt(inVec.x ** 2 + inVec.y ** 2 + inVec.z ** 2) || 1, trim = Math.min(inMag, runLen);
    runFrom = { x: point.x - (inVec.x / inMag) * trim, y: point.y - (inVec.y / inMag) * trim, z: point.z - (inVec.z / inMag) * trim };
  }
  if (candidate.nextSeg) {
    const origTo = clonePoint(nodeIndex[candidate.nextSeg.to]);
    const outVec = directionVector(point, origTo), outMag = Math.sqrt(outVec.x ** 2 + outVec.y ** 2 + outVec.z ** 2) || 1, trim = Math.min(outMag, runLen);
    runTo = { x: point.x + (outVec.x / outMag) * trim, y: point.y + (outVec.y / outMag) * trim, z: point.z + (outVec.z / outMag) * trim };
  }
  const branchRoute = (routes || []).find((item) => item.id === candidate.branchRouteId) || null;
  const otherNode = branchRoute ? (branchRoute.nodes || []).find((item) => isSamePoint(item, point)) : null;
  const otherSeg = candidate.branchSeg || (branchRoute?.segments || []).find((seg) => seg.from === otherNode?.id || seg.to === otherNode?.id);
  if (otherSeg && otherNode) {
    const branchNodeIndex = routeNodeIndex(branchRoute), otherEndId = otherSeg.from === otherNode.id ? otherSeg.to : otherSeg.from, otherEndNode = clonePoint(branchNodeIndex[otherEndId]);
    const brVec = directionVector(point, otherEndNode), brMag = Math.sqrt(brVec.x ** 2 + brVec.y ** 2 + brVec.z ** 2) || 1, brTrim = Math.min(brMag, branchLen);
    bp = { x: point.x + (brVec.x / brMag) * brTrim, y: point.y + (brVec.y / brMag) * brTrim, z: point.z + (brVec.z / brMag) * brTrim };
  }
  return { id: `route:${route.id}:auto-tee:${candidate.nodeId}`, routeId: route.id, component: 'TEE', point, origin: point, ep1: runFrom, ep2: runTo, bp, subtype: resolved.subtype || payload.subtype || candidate.subtype || 'EQUAL', size: resolved.size || payload.size || candidate.runSize || route.spec?.size || '', branchSize: resolved.branchSize || payload.branchSize || candidate.branchSize || '', rating: resolved.rating || payload.rating || candidate.rating || route.spec?.rating || '', length: resolved.runCenterToEnd || resolved.length || payload.length || '', branchLength: resolved.branchCenterToEnd || payload.branchLength || '', weight: resolved.weight || payload.weight || '', provenance: payload.provenance || 'manual', matchKey: payload.matchKey || '', pipelineRef: route.spec?.pipelineRef || route.spec?.pipeline || 'ROUTE-AUTHORED', branchRouteId: candidate.branchRouteId || '' };
}
const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
function normalizeInlineAttributes(payload, routeId) {
  const componentKind = payload.component || payload.type || 'COMPONENT';
  const type = firstValue(payload.flangeType, payload.supportType, payload.kind, payload.type, payload.subtype);
  const rating = firstValue(payload.rating, payload.class, payload.className);
  const routeRef = firstValue(payload.route, routeId);
  const name = firstValue(payload.name, payload.supportName, payload.id);
  const supportKind = firstValue(payload.kind, payload.supportType);
  const segment = firstValue(payload.segment, payload.segmentId);
  return {
    SOURCE: 'route-engine-inline',
    ROUTE_ID: routeId || '',
    ROUTE: routeRef,
    SUBTYPE: payload.subtype || type || '',
    TYPE: type || componentKind,
    CLASS: rating,
    RATING: rating,
    SIZE: payload.size || '',
    FACING: payload.facing || '',
    ENDTYPE: payload.endType || '',
    LENGTH: payload.length || '',
    BRANCH_LENGTH: payload.branchLength || '',
    WEIGHT: payload.weight || '',
    PROVENANCE: payload.provenance || 'manual',
    ANGLE: payload.angle || '',
    MATCHKEY: payload.matchKey || '',
    BRANCH_SIZE: payload.branchSize || '',
    BRANCH_ROUTE_ID: payload.branchRouteId || '',
    NAME: name,
    KIND: supportKind,
    SEGMENT: segment,
    ATTACH: firstValue(payload.attach, payload.attachment),
    'PIPELINE-REFERENCE': payload.pipeline || payload.pipelineRef || 'ROUTE-AUTHORED',
  };
}
export function normalizeInlineComponent(payload = {}, state) {
  const routeId = payload.routeId || state.selection?.activeRouteId || null;
  let point = normalizePoint(payload.point || payload.origin || { x: 0, y: 0, z: 0 });
  const route = routeId ? (state.model?.routes || []).find((item) => item.id === routeId) : null;
  if (route?.nodes?.length && (!payload.point && !payload.origin)) point = clonePoint(route.nodes[route.nodes.length - 1]);
  const componentKind = payload.component || payload.type || 'COMPONENT';
  return {
    id: payload.id || uid('inline-comp'),
    type: componentKind,
    label: `${componentKind} ${payload.id || ''}`.trim(),
    geometry: {
      origin: point,
      ep1: payload.ep1 ? normalizePoint(payload.ep1) : null,
      ep2: payload.ep2 ? normalizePoint(payload.ep2) : null,
      cp: payload.cp ? normalizePoint(payload.cp) : null,
      bp: payload.bp ? normalizePoint(payload.bp) : null,
      bore: parseBore(payload),
      size: null,
    },
    attributes: normalizeInlineAttributes(payload, routeId),
    metadata: { source: payload, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] },
  };
}
function routeSegmentToComponent(route, segment, nodeIndex) {
  const ep1 = clonePoint(nodeIndex[segment.from]), ep2 = clonePoint(nodeIndex[segment.to]), bore = parseBore(route.spec);
  return { id: `route:${route.id}:seg:${segment.id}`, type: segment.kind || 'PIPE', label: `${segment.kind || 'PIPE'} ${segment.id}`, geometry: { origin: midpoint(ep1, ep2), ep1, ep2, cp: null, bp: null, bore, size: null }, attributes: { SOURCE: 'route-engine', ROUTE_ID: route.id, SEGMENT_ID: segment.id, ORIENTATION: segment.orientation || classifySegmentOrientation(ep1, ep2), 'PIPELINE-REFERENCE': route.spec?.pipeline || route.spec?.pipelineRef || 'ROUTE-AUTHORED' }, metadata: { source: { routeId: route.id, segmentId: segment.id }, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] } };
}
function routeCornerToElbow(route, prevSeg, nextSeg, nodeIndex) {
  const prevNode = clonePoint(nodeIndex[prevSeg.from]), cornerNode = clonePoint(nodeIndex[prevSeg.to]), nextNode = clonePoint(nodeIndex[nextSeg.to]), elbow = orthogonalElbowControl(prevNode, cornerNode, nextNode), bore = parseBore(route.spec);
  return { id: `route:${route.id}:elbow:${prevSeg.id}:${nextSeg.id}`, type: 'ELBOW', label: `ELBOW ${route.id}`, geometry: { origin: clonePoint(cornerNode), ep1: elbow.ep1, ep2: elbow.ep2, cp: elbow.cp, bp: null, bore, size: null }, attributes: { SOURCE: 'route-engine', ROUTE_ID: route.id, PREV_SEGMENT_ID: prevSeg.id, NEXT_SEGMENT_ID: nextSeg.id, 'PIPELINE-REFERENCE': route.spec?.pipeline || route.spec?.pipelineRef || 'ROUTE-AUTHORED' }, metadata: { source: { routeId: route.id, nodeId: prevSeg.to }, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] } };
}
export function routeModelToComponents(routes = [], inlineComponents = [], guides = []) {
  const components = [];
  for (const route of routes || []) {
    const nodeIndex = routeNodeIndex(route);
    for (const seg of route.segments || []) components.push(routeSegmentToComponent(route, seg, nodeIndex));
    for (let i = 1; i < (route.segments || []).length; i++) {
      const prevSeg = route.segments[i - 1], nextSeg = route.segments[i];
      if (prevSeg.to === nextSeg.from && !(route.convertedBendNodes || []).includes(prevSeg.to) && isTurnBetween(nodeIndex, prevSeg, nextSeg)) components.push(routeCornerToElbow(route, prevSeg, nextSeg, nodeIndex));
    }
  }
  for (const g of guides || []) components.push({ id: g.id, type: 'GUIDE', label: `${g.type || 'LINE'} GUIDE`, geometry: { points: g.points, origin: g.points?.[0] || { x: 0, y: 0, z: 0 } }, attributes: g.attributes || {}, metadata: { source: { guideId: g.id }, squareText: null, squarePos: null, circleText: null, circleCoord: null, warnings: [] } });
  return [...components, ...(inlineComponents || [])];
}
export { normalizeAxisDelta, normalizePoint, pointsEqual, classifySegmentOrientation, routeNodeIndex, createRouteNode, createRouteSegment };
