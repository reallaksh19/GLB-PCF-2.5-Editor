/**
 * editor/route-engine.js
 * AI-2 command-driven route authoring engine.
 */

import { createInitialEditorState } from '../core/state.js';
import { emit } from '../core/event-bus.js';
import { createHistoryRecord, createInitialHistoryState } from './history.js';
import { createCommand, CommandTypes } from './command-types.js';
import { executeEditorCommand } from './command-executor.js';
import { getCommandHandler, registerCommandHandler } from './command-handlers.js';
import { createEmptyRoute, createRouteNode, createRouteSegment } from './route-contract.js';
import { applyDelta, boundsFromPoints, clonePoint, normalizeAxisDelta, normalizePoint, pointsEqual } from './coordinate-normalizer.js';
import { aggregateRouteMetrics, classifySegmentOrientation, routeNodeIndex } from './route-metrics.js';

export const ROUTE_ENGINE_VERSION = '1.0.0-ai2';

function uid(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function parseBore(spec = {}) {
  const candidate = spec.bore ?? spec.size ?? spec.nominalSize ?? 100;
  const match = String(candidate).match(/-?\d+(?:\.\d+)?/);
  const num = match ? Number(match[0]) : Number(candidate);
  return Number.isFinite(num) ? Math.max(num, 25) : 100;
}

function getRouteIndex(state, routeId) {
  return (state.model?.routes || []).findIndex((route) => route.id === routeId);
}

function getRouteOrThrow(state, routeId) {
  const index = getRouteIndex(state, routeId || state.selection?.activeRouteId);
  if (index < 0) throw new Error(`Route not found: ${routeId || state.selection?.activeRouteId || 'unknown'}`);
  return { index, route: state.model.routes[index] };
}

function buildDiagnostics(state, routeId, commandType) {
  const metrics = aggregateRouteMetrics(state.model.routes || []);
  return {
    traces: [...(state.diagnostics?.traces || [])],
    metrics: {
      ...(state.diagnostics?.metrics || {}),
      routes: metrics,
      lastRouteId: routeId || null,
      lastCommandType: commandType,
    },
  };
}

function patchStateWithRoute(state, nextRoutes, routeId, commandType, extra = {}) {
  return {
    model: {
      ...(state.model || {}),
      routes: nextRoutes,
      components: extra.modelComponents ?? state.model?.components ?? [],
    },
    selection: {
      ...(state.selection || {}),
      activeRouteId: routeId || state.selection?.activeRouteId || null,
      ids: routeId ? [routeId] : (state.selection?.ids || []),
    },
    diagnostics: buildDiagnostics({ ...state, model: { ...(state.model || {}), routes: nextRoutes } }, routeId, commandType),
  };
}

function resolveTargetPoint(route, payload = {}) {
  const lastNode = route.nodes[route.nodes.length - 1];
  if (!lastNode) throw new Error('Route has no nodes');

  if (payload.to && typeof payload.to === 'object') return normalizePoint(payload.to);
  if (payload.absolute && typeof payload.absolute === 'object') return normalizePoint(payload.absolute);
  if (['x', 'y', 'z'].some((key) => payload[key] != null) && payload.useAbsolute === true) {
    return normalizePoint({ x: payload.x, y: payload.y, z: payload.z });
  }

  const delta = normalizeAxisDelta({ dx: payload.dx, dy: payload.dy, dz: payload.dz });
  return applyDelta(lastNode, delta);
}

function routeMidpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function orthogonalElbowControl(prevNode, cornerNode, nextNode) {
  const inVec = {
    x: cornerNode.x - prevNode.x,
    y: cornerNode.y - prevNode.y,
    z: cornerNode.z - prevNode.z,
  };
  const outVec = {
    x: nextNode.x - cornerNode.x,
    y: nextNode.y - cornerNode.y,
    z: nextNode.z - cornerNode.z,
  };
  const inMag = Math.sqrt(inVec.x ** 2 + inVec.y ** 2 + inVec.z ** 2) || 1;
  const outMag = Math.sqrt(outVec.x ** 2 + outVec.y ** 2 + outVec.z ** 2) || 1;
  const trim = Math.min(inMag, outMag, 250);

  return {
    ep1: {
      x: cornerNode.x - (inVec.x / inMag) * trim,
      y: cornerNode.y - (inVec.y / inMag) * trim,
      z: cornerNode.z - (inVec.z / inMag) * trim,
    },
    cp: clonePoint(cornerNode),
    ep2: {
      x: cornerNode.x + (outVec.x / outMag) * trim,
      y: cornerNode.y + (outVec.y / outMag) * trim,
      z: cornerNode.z + (outVec.z / outMag) * trim,
    },
  };
}

function routeSegmentToComponent(route, segment, nodeIndex) {
  const ep1 = clonePoint(nodeIndex[segment.from]);
  const ep2 = clonePoint(nodeIndex[segment.to]);
  const bore = parseBore(route.spec);
  return {
    id: `route:${route.id}:seg:${segment.id}`,
    type: segment.kind || 'PIPE',
    label: `${segment.kind || 'PIPE'} ${segment.id}`,
    geometry: {
      origin: routeMidpoint(ep1, ep2),
      ep1,
      ep2,
      cp: null,
      bp: null,
      bore,
      size: null,
    },
    attributes: {
      SOURCE: 'route-engine',
      ROUTE_ID: route.id,
      SEGMENT_ID: segment.id,
      ORIENTATION: segment.orientation || classifySegmentOrientation(ep1, ep2),
      'PIPELINE-REFERENCE': route.spec?.pipeline || route.spec?.pipelineRef || 'ROUTE-AUTHORED',
    },
    metadata: {
      source: { routeId: route.id, segmentId: segment.id },
      squareText: null,
      squarePos: null,
      circleText: null,
      circleCoord: null,
      warnings: [],
    },
  };
}

function routeCornerToElbow(route, prevSeg, nextSeg, nodeIndex) {
  const prevNode = clonePoint(nodeIndex[prevSeg.from]);
  const cornerNode = clonePoint(nodeIndex[prevSeg.to]);
  const nextNode = clonePoint(nodeIndex[nextSeg.to]);
  const elbow = orthogonalElbowControl(prevNode, cornerNode, nextNode);
  const bore = parseBore(route.spec);
  return {
    id: `route:${route.id}:elbow:${prevSeg.id}:${nextSeg.id}`,
    type: 'ELBOW',
    label: `ELBOW ${route.id}`,
    geometry: {
      origin: clonePoint(cornerNode),
      ep1: elbow.ep1,
      ep2: elbow.ep2,
      cp: elbow.cp,
      bp: null,
      bore,
      size: null,
    },
    attributes: {
      SOURCE: 'route-engine',
      ROUTE_ID: route.id,
      PREV_SEGMENT_ID: prevSeg.id,
      NEXT_SEGMENT_ID: nextSeg.id,
      'PIPELINE-REFERENCE': route.spec?.pipeline || route.spec?.pipelineRef || 'ROUTE-AUTHORED',
    },
    metadata: {
      source: { routeId: route.id, nodeId: prevSeg.to },
      squareText: null,
      squarePos: null,
      circleText: null,
      circleCoord: null,
      warnings: [],
    },
  };
}


function ensureRouteFlags(route) {
  route.convertedBendNodes ||= [];
  route.convertedTeeNodes ||= [];
  return route;
}

function isSamePoint(a, b, eps = 0.001) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}


function directionVector(a, b) {
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function crossMagnitude(u, v) {
  const cx = u.y * v.z - u.z * v.y;
  const cy = u.z * v.x - u.x * v.z;
  const cz = u.x * v.y - u.y * v.x;
  return Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function isTurnBetween(nodeIndex, prevSeg, nextSeg, eps = 0.001) {
  if (!prevSeg || !nextSeg) return false;
  const a = nodeIndex[prevSeg.from];
  const b = nodeIndex[prevSeg.to];
  const c = nodeIndex[nextSeg.to];
  if (!a || !b || !c) return false;
  const u = directionVector(a, b);
  const v = directionVector(b, c);
  const magU = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z);
  const magV = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (magU <= eps || magV <= eps) return false;
  return crossMagnitude(u, v) > eps;
}

function findPrevNextSegments(route, nodeId) {
  const prevSeg = (route.segments || []).find((seg) => seg.to === nodeId) || null;
  const nextSeg = (route.segments || []).find((seg) => seg.from === nodeId) || null;
  return { prevSeg, nextSeg };
}

function routeBendCandidate(route, preferredNodeId = null) {
  const nodeIndex = routeNodeIndex(route);
  const candidates = preferredNodeId
    ? (route.nodes || []).filter((node) => node.id === preferredNodeId)
    : (route.nodes || []).slice(1, -1);

  for (const node of candidates) {
    if ((route.convertedBendNodes || []).includes(node.id)) continue;
    const { prevSeg, nextSeg } = findPrevNextSegments(route, node.id);
    if (!prevSeg || !nextSeg) continue;
    if (!isTurnBetween(nodeIndex, prevSeg, nextSeg)) continue;
    return {
      routeId: route.id,
      nodeId: node.id,
      cornerPoint: clonePoint(node),
      prevSegId: prevSeg.id,
      nextSegId: nextSeg.id,
      prevSeg,
      nextSeg,
      size: route.spec?.size || route.spec?.nominalSize || '',
      rating: route.spec?.rating || '',
    };
  }
  return null;
}

function routeTeeCandidate(routes, targetRoute, preferredNodeId = null) {
  const nodes = preferredNodeId
    ? (targetRoute.nodes || []).filter((node) => node.id === preferredNodeId)
    : (targetRoute.nodes || []);
  const targetNodeIndex = routeNodeIndex(targetRoute);

  for (const node of nodes) {
    if ((targetRoute.convertedTeeNodes || []).includes(node.id)) continue;
    const { prevSeg, nextSeg } = findPrevNextSegments(targetRoute, node.id);
    if (!prevSeg && !nextSeg) continue;

    for (const otherRoute of routes || []) {
      if (!otherRoute || otherRoute.id === targetRoute.id) continue;
      const otherNode = (otherRoute.nodes || []).find((item) => isSamePoint(item, node));
      if (!otherNode) continue;
      const otherSeg = (otherRoute.segments || []).find((seg) => seg.from === otherNode.id || seg.to === otherNode.id) || null;
      if (!otherSeg) continue;

      return {
        routeId: targetRoute.id,
        nodeId: node.id,
        branchRouteId: otherRoute.id,
        point: clonePoint(node),
        runSize: targetRoute.spec?.size || '',
        branchSize: otherRoute.spec?.size || targetRoute.spec?.size || '',
        rating: targetRoute.spec?.rating || otherRoute.spec?.rating || '',
        subtype: (otherRoute.spec?.size || '') && String(otherRoute.spec?.size) !== String(targetRoute.spec?.size || '') ? 'REDUCING' : 'EQUAL',
        prevSeg,
        nextSeg,
        branchSeg: otherSeg,
        nodeIndex: targetNodeIndex,
      };
    }
  }
  return null;
}

function buildAutoBendPayload(route, candidate, resolved = {}, payload = {}) {
  const nodeIndex = routeNodeIndex(route);
  const prevSeg = (route.segments || []).find((seg) => seg.id === candidate.prevSegId) || candidate.prevSeg;
  const nextSeg = (route.segments || []).find((seg) => seg.id === candidate.nextSegId) || candidate.nextSeg;
  const prevNode = clonePoint(nodeIndex[prevSeg.from]);
  const cornerNode = clonePoint(nodeIndex[prevSeg.to]);
  const nextNode = clonePoint(nodeIndex[nextSeg.to]);
  const elbow = orthogonalElbowControl(prevNode, cornerNode, nextNode);
  return {
    id: `route:${route.id}:auto-bend:${candidate.nodeId}`,
    routeId: route.id,
    component: 'ELBOW',
    point: cornerNode,
    origin: cornerNode,
    ep1: elbow.ep1,
    ep2: elbow.ep2,
    cp: elbow.cp,
    subtype: resolved.subtype || payload.subtype || payload.radiusType || 'LR',
    size: resolved.size || payload.size || route.spec?.size || '',
    rating: resolved.rating || payload.rating || route.spec?.rating || '',
    angle: resolved.angle || payload.angle || 90,
    length: resolved.centerToEnd || resolved.length || payload.length || '',
    weight: resolved.weight || payload.weight || '',
    provenance: payload.provenance || 'manual',
    matchKey: payload.matchKey || '',
    pipelineRef: route.spec?.pipelineRef || route.spec?.pipeline || 'ROUTE-AUTHORED',
  };
}

function buildAutoTeePayload(routes, route, candidate, resolved = {}, payload = {}) {
  const nodeIndex = routeNodeIndex(route);
  const point = clonePoint(nodeIndex[candidate.nodeId]);
  const prevSeg = candidate.prevSeg;
  const nextSeg = candidate.nextSeg;
  const runFrom = prevSeg ? clonePoint(nodeIndex[prevSeg.from]) : clonePoint(point);
  const runTo = nextSeg ? clonePoint(nodeIndex[nextSeg.to]) : clonePoint(point);
  const branchRoute = (routes || []).find((item) => item.id === candidate.branchRouteId) || null;
  let bp = clonePoint(point);
  if (branchRoute) {
    const otherNode = (branchRoute.nodes || []).find((item) => isSamePoint(item, point));
    const otherSeg = candidate.branchSeg || (branchRoute.segments || []).find((seg) => seg.from === otherNode?.id || seg.to === otherNode?.id);
    if (otherSeg && otherNode) {
      const branchNodeIndex = routeNodeIndex(branchRoute);
      const otherEndId = otherSeg.from === otherNode.id ? otherSeg.to : otherSeg.from;
      bp = clonePoint(branchNodeIndex[otherEndId]);
    }
  }
  return {
    id: `route:${route.id}:auto-tee:${candidate.nodeId}`,
    routeId: route.id,
    component: 'TEE',
    point,
    origin: point,
    ep1: runFrom,
    ep2: runTo,
    bp,
    subtype: resolved.subtype || payload.subtype || candidate.subtype || 'EQUAL',
    size: resolved.size || payload.size || candidate.runSize || route.spec?.size || '',
    branchSize: resolved.branchSize || payload.branchSize || candidate.branchSize || '',
    rating: resolved.rating || payload.rating || candidate.rating || route.spec?.rating || '',
    length: resolved.runCenterToEnd || resolved.length || payload.length || '',
    branchLength: resolved.branchCenterToEnd || payload.branchLength || '',
    weight: resolved.weight || payload.weight || '',
    provenance: payload.provenance || 'manual',
    matchKey: payload.matchKey || '',
    pipelineRef: route.spec?.pipelineRef || route.spec?.pipeline || 'ROUTE-AUTHORED',
    branchRouteId: candidate.branchRouteId || '',
  };
}

function normalizeInlineComponent(payload = {}, state) {
  const routeId = payload.routeId || state.selection?.activeRouteId || null;
  let point = normalizePoint(payload.point || payload.origin || { x: 0, y: 0, z: 0 });

  if (routeId) {
    const route = (state.model?.routes || []).find((item) => item.id === routeId);
    if (route?.nodes?.length && (!payload.point && !payload.origin)) {
      point = clonePoint(route.nodes[route.nodes.length - 1]);
    }
  }

  return {
    id: payload.id || uid('inline-comp'),
    type: payload.component || payload.type || 'VALVE',
    label: `${payload.component || payload.type || 'COMPONENT'} ${payload.id || ''}`.trim(),
    geometry: {
      origin: point,
      ep1: payload.ep1 ? normalizePoint(payload.ep1) : null,
      ep2: payload.ep2 ? normalizePoint(payload.ep2) : null,
      cp: payload.cp ? normalizePoint(payload.cp) : null,
      bp: payload.bp ? normalizePoint(payload.bp) : null,
      bore: parseBore(payload),
      size: null,
    },
    attributes: {
      SOURCE: 'route-engine-inline',
      ROUTE_ID: routeId || '',
      SUBTYPE: payload.subtype || '',
      RATING: payload.rating || '',
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
      'PIPELINE-REFERENCE': payload.pipeline || payload.pipelineRef || 'ROUTE-AUTHORED',
    },
    metadata: {
      source: payload,
      squareText: null,
      squarePos: null,
      circleText: null,
      circleCoord: null,
      warnings: [],
    },
  };
}

function defaultHandlersRegistered() {
  return !!getCommandHandler(CommandTypes.ROUTE_START);
}

export function registerDefaultRouteHandlers() {
  if (defaultHandlersRegistered()) return;

  registerCommandHandler(CommandTypes.ROUTE_START, (state, command) => {
    const point = normalizePoint(command.payload);
    const route = createEmptyRoute(command.payload.routeId || uid('route'), command.payload.spec || {});
    const startNode = createRouteNode(command.payload.nodeId || uid('node'), point.x, point.y, point.z);
    route.nodes.push(startNode);

    const nextRoutes = [...(state.model?.routes || []), route];
    return patchStateWithRoute(state, nextRoutes, route.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_SEGMENT_ADD, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const lastNode = nextRoute.nodes[nextRoute.nodes.length - 1];
    const target = resolveTargetPoint(nextRoute, command.payload);
    if (pointsEqual(lastNode, target)) throw new Error('Route segment target matches last node');

    const nextNode = createRouteNode(command.payload.nodeId || uid('node'), target.x, target.y, target.z);
    const orientation = classifySegmentOrientation(lastNode, nextNode);
    const segment = createRouteSegment(command.payload.segmentId || uid('segment'), lastNode.id, nextNode.id, command.payload.kind || 'PIPE', orientation);

    nextRoute.nodes.push(nextNode);
    nextRoute.segments.push(segment);
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_SEGMENT_EDIT, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const segIndex = nextRoute.segments.findIndex((seg) => seg.id === command.payload.segmentId);
    if (segIndex < 0) throw new Error(`Segment not found: ${command.payload.segmentId}`);

    const segment = nextRoute.segments[segIndex];
    const moveNodeId = command.payload.endpoint === 'from' ? segment.from : segment.to;
    const node = nextRoute.nodes.find((item) => item.id === moveNodeId);
    if (!node) throw new Error(`Node not found: ${moveNodeId}`);

    const nextPoint = command.payload.absolute
      ? normalizePoint(command.payload.absolute)
      : applyDelta(node, normalizeAxisDelta({ dx: command.payload.dx, dy: command.payload.dy, dz: command.payload.dz }));

    node.x = nextPoint.x;
    node.y = nextPoint.y;
    node.z = nextPoint.z;

    for (const seg of nextRoute.segments) {
      if (seg.from === node.id || seg.to === node.id) {
        const nodeIndex = routeNodeIndex(nextRoute);
        seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
      }
    }

    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_NODE_MOVE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const node = nextRoute.nodes.find((item) => item.id === command.payload.nodeId);
    if (!node) throw new Error(`Node not found: ${command.payload.nodeId}`);

    const nextPoint = command.payload.absolute
      ? normalizePoint(command.payload.absolute)
      : applyDelta(node, normalizeAxisDelta({ dx: command.payload.dx, dy: command.payload.dy, dz: command.payload.dz }));
    node.x = nextPoint.x;
    node.y = nextPoint.y;
    node.z = nextPoint.z;

    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) {
      if (seg.from === node.id || seg.to === node.id) {
        seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
      }
    }

    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_SPLIT_SEGMENT, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const segIndex = nextRoute.segments.findIndex((seg) => seg.id === command.payload.segmentId);
    if (segIndex < 0) throw new Error(`Segment not found: ${command.payload.segmentId}`);

    const segment = nextRoute.segments[segIndex];
    const nodeIndex = routeNodeIndex(nextRoute);
    const a = nodeIndex[segment.from];
    const b = nodeIndex[segment.to];
    const splitPoint = command.payload.point
      ? normalizePoint(command.payload.point)
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };

    const middleNode = createRouteNode(command.payload.nodeId || uid('node'), splitPoint.x, splitPoint.y, splitPoint.z);
    const first = createRouteSegment(uid('segment'), segment.from, middleNode.id, segment.kind || 'PIPE', classifySegmentOrientation(a, middleNode));
    const second = createRouteSegment(uid('segment'), middleNode.id, segment.to, segment.kind || 'PIPE', classifySegmentOrientation(middleNode, b));

    nextRoute.nodes.push(middleNode);
    nextRoute.segments.splice(segIndex, 1, first, second);
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_NODE_STRETCH, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const node = nextRoute.nodes.find((item) => item.id === command.payload.nodeId);
    if (!node) throw new Error(`Node not found: ${command.payload.nodeId}`);

    const nextPoint = command.payload.absolute
      ? normalizePoint(command.payload.absolute)
      : applyDelta(node, normalizeAxisDelta({ dx: command.payload.dx, dy: command.payload.dy, dz: command.payload.dz }));
    node.x = nextPoint.x;
    node.y = nextPoint.y;
    node.z = nextPoint.z;

    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) {
      if (seg.from === node.id || seg.to === node.id) {
        seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
      }
    }

    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_ROTATE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const pivot = normalizePoint(command.payload.pivot);
    const angleRad = (command.payload.angleDeg || 0) * (Math.PI / 180);
    const axis = command.payload.axis || 'Z';

    const s = Math.sin(angleRad);
    const c = Math.cos(angleRad);

    for (const node of nextRoute.nodes) {
      const dx = node.x - pivot.x;
      const dy = node.y - pivot.y;
      const dz = node.z - pivot.z;

      if (axis === 'Z') {
        node.x = pivot.x + (dx * c - dy * s);
        node.y = pivot.y + (dx * s + dy * c);
      } else if (axis === 'X') {
        node.y = pivot.y + (dy * c - dz * s);
        node.z = pivot.z + (dy * s + dz * c);
      } else if (axis === 'Y') {
        node.z = pivot.z + (dz * c - dx * s);
        node.x = pivot.x + (dz * s + dx * c);
      }
    }

    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) {
      seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
    }

    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_BREAK, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);
    const segIndex = nextRoute.segments.findIndex((seg) => seg.id === command.payload.segmentId);
    if (segIndex < 0) throw new Error(`Segment not found: ${command.payload.segmentId}`);

    const segment = nextRoute.segments[segIndex];
    const nodeIndex = routeNodeIndex(nextRoute);
    const a = nodeIndex[segment.from];
    const b = nodeIndex[segment.to];
    const breakPoint = command.payload.point
      ? normalizePoint(command.payload.point)
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };

    const gap = command.payload.gapMm || 0;

    if (gap > 0) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const ux = dx / len, uy = dy / len, uz = dz / len;

      const p1 = { x: breakPoint.x - ux * (gap/2), y: breakPoint.y - uy * (gap/2), z: breakPoint.z - uz * (gap/2) };
      const p2 = { x: breakPoint.x + ux * (gap/2), y: breakPoint.y + uy * (gap/2), z: breakPoint.z + uz * (gap/2) };

      const n1 = createRouteNode(uid('node'), p1.x, p1.y, p1.z);
      const n2 = createRouteNode(uid('node'), p2.x, p2.y, p2.z);
      nextRoute.nodes.push(n1, n2);

      const first = createRouteSegment(uid('segment'), segment.from, n1.id, segment.kind || 'PIPE', classifySegmentOrientation(a, n1));
      const second = createRouteSegment(uid('segment'), n2.id, segment.to, segment.kind || 'PIPE', classifySegmentOrientation(n2, b));
      nextRoute.segments.splice(segIndex, 1, first, second);
    } else {
      const middleNode = createRouteNode(uid('node'), breakPoint.x, breakPoint.y, breakPoint.z);
      nextRoute.nodes.push(middleNode);
      const first = createRouteSegment(uid('segment'), segment.from, middleNode.id, segment.kind || 'PIPE', classifySegmentOrientation(a, middleNode));
      const second = createRouteSegment(uid('segment'), middleNode.id, segment.to, segment.kind || 'PIPE', classifySegmentOrientation(middleNode, b));
      nextRoute.segments.splice(segIndex, 1, first, second);
    }

    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_NODE_DELETE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);

    const nodeId = command.payload.nodeId;
    const nodeIdx = nextRoute.nodes.findIndex(n => n.id === nodeId);
    if (nodeIdx < 0) throw new Error(`Node not found: ${nodeId}`);

    // Find segments connected to this node
    const connectedSegments = nextRoute.segments.filter(s => s.from === nodeId || s.to === nodeId);

    if (connectedSegments.length === 2 && command.payload.heal) {
      // Heal behavior: connect the two other ends
      const s1 = connectedSegments[0];
      const s2 = connectedSegments[1];
      const otherEnd1 = s1.from === nodeId ? s1.to : s1.from;
      const otherEnd2 = s2.from === nodeId ? s2.to : s2.from;

      const newSeg = createRouteSegment(uid('segment'), otherEnd1, otherEnd2, s1.kind || 'PIPE');
      nextRoute.segments = nextRoute.segments.filter(s => s.from !== nodeId && s.to !== nodeId);
      nextRoute.segments.push(newSeg);
    } else {
      // Disconnect behavior: just remove segments
      nextRoute.segments = nextRoute.segments.filter(s => s.from !== nodeId && s.to !== nodeId);
    }

    nextRoute.nodes.splice(nodeIdx, 1);
    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) {
      seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
    }

    // Cleanup dangling components might be required later, but this deletes the topology node.
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_DELETE, (state, command) => {
    const nextRoutes = (state.model?.routes || []).filter((route) => route.id !== command.payload.routeId);
    return patchStateWithRoute(state, nextRoutes, null, command.type);
  });

  registerCommandHandler(CommandTypes.INSERT_COMPONENT, (state, command) => {
    const component = normalizeInlineComponent(command.payload, state);
    return {
      model: {
        ...(state.model || {}),
        routes: [...(state.model?.routes || [])],
        components: [...(state.model?.components || []), component],
      },
      diagnostics: buildDiagnostics(state, command.payload.routeId || state.selection?.activeRouteId || null, command.type),
    };
  });

  registerCommandHandler(CommandTypes.DELETE_COMPONENT, (state, command) => {
    return {
      model: {
        ...(state.model || {}),
        routes: [...(state.model?.routes || [])],
        components: (state.model?.components || []).filter((item) => item.id !== command.payload.id),
      },
      diagnostics: buildDiagnostics(state, command.payload.routeId || state.selection?.activeRouteId || null, command.type),
    };
  });

  registerCommandHandler(CommandTypes.AUTO_BEND, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = ensureRouteFlags(clone(route));
    const candidate = routeBendCandidate(nextRoute, command.payload.nodeId);
    if (!candidate) throw new Error('No eligible bend conversion candidate found');
    if (!nextRoute.convertedBendNodes.includes(candidate.nodeId)) nextRoute.convertedBendNodes.push(candidate.nodeId);

    const payload = buildAutoBendPayload(nextRoute, candidate, command.payload.resolved || {}, command.payload);
    const component = normalizeInlineComponent(payload, {
      model: state.model,
      selection: state.selection,
    });
    const nextComponents = (state.model?.components || []).filter((item) => item.id !== component.id).concat(component);

    nextRoutes[index] = nextRoute;
    return {
      model: {
        ...(state.model || {}),
        routes: nextRoutes,
        components: nextComponents,
      },
      diagnostics: buildDiagnostics(state, nextRoute.id, command.type),
    };
  });

  registerCommandHandler(CommandTypes.AUTO_TEE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = ensureRouteFlags(clone(route));
    const candidate = routeTeeCandidate(state.model?.routes || [], nextRoute, command.payload.nodeId);
    if (!candidate) throw new Error('No eligible tee conversion candidate found');
    if (!nextRoute.convertedTeeNodes.includes(candidate.nodeId)) nextRoute.convertedTeeNodes.push(candidate.nodeId);

    const payload = buildAutoTeePayload(state.model?.routes || [], nextRoute, candidate, command.payload.resolved || {}, command.payload);
    const component = normalizeInlineComponent(payload, {
      model: state.model,
      selection: state.selection,
    });
    const nextComponents = (state.model?.components || []).filter((item) => item.id !== component.id).concat(component);

    nextRoutes[index] = nextRoute;
    return {
      model: {
        ...(state.model || {}),
        routes: nextRoutes,
        components: nextComponents,
      },
      diagnostics: buildDiagnostics(state, nextRoute.id, command.type),
    };
  });

}

function createEditorStore(seedState) {
  let state = {
    ...clone(seedState || createInitialEditorState()),
    history: createInitialHistoryState(),
  };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(nextState) {
      state = nextState;
      listeners.forEach((fn) => fn(state));
    },
    applyPatch(patch, command) {
      const history = state.history || createInitialHistoryState();
      const nextState = {
        ...state,
        ...patch,
        model: patch.model ? { ...(state.model || {}), ...patch.model } : (state.model || {}),
        selection: patch.selection ? { ...(state.selection || {}), ...patch.selection } : (state.selection || {}),
        diagnostics: patch.diagnostics ? { ...(state.diagnostics || {}), ...patch.diagnostics } : (state.diagnostics || {}),
      };

      if (!command?.meta?.skipHistory && !command?.meta?.transient) {
        const record = createHistoryRecord(command, patch, { routeEngineVersion: ROUTE_ENGINE_VERSION });
        nextState.history = {
          ...history,
          undoStack: [...(history.undoStack || []), record],
          redoStack: [],
        };
      } else {
        nextState.history = history;
      }

      state = nextState;
      listeners.forEach((fn) => fn(state, command, patch));
      return nextState;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function routeModelToComponents(routes = [], inlineComponents = []) {
  const components = [];
  for (const route of routes || []) {
    const nodeIndex = routeNodeIndex(route);
    for (const seg of route.segments || []) {
      components.push(routeSegmentToComponent(route, seg, nodeIndex));
    }
    for (let i = 1; i < (route.segments || []).length; i++) {
      const prevSeg = route.segments[i - 1];
      const nextSeg = route.segments[i];
      if (prevSeg.to !== nextSeg.from) continue;
      if ((route.convertedBendNodes || []).includes(prevSeg.to)) continue;
      if (isTurnBetween(nodeIndex, prevSeg, nextSeg)) {
        components.push(routeCornerToElbow(route, prevSeg, nextSeg, nodeIndex));
      }
    }
  }
  return [...components, ...(inlineComponents || [])];
}

export function createRouteEngine(options = {}) {
  registerDefaultRouteHandlers();

  const store = createEditorStore(options.initialState || createInitialEditorState());
  const listeners = new Set();

  function notifyTrace(event, details = {}, ok = true) {
    const trace = {
      scope: 'route-engine',
      event,
      ok,
      details,
      timestamp: Date.now(),
      version: ROUTE_ENGINE_VERSION,
    };
    emit('debug:trace', trace);
    options.onTrace?.(trace);
    return trace;
  }

  store.subscribe((nextState, command) => {
    const metrics = aggregateRouteMetrics(nextState.model?.routes || []);
    nextState.diagnostics = nextState.diagnostics || { traces: [], metrics: {} };
    nextState.diagnostics.metrics = {
      ...(nextState.diagnostics.metrics || {}),
      routes: metrics,
      bounds: boundsFromPoints((nextState.model?.routes || []).flatMap((route) => route.nodes || [])),
    };
    listeners.forEach((fn) => fn(nextState, command));
  });

  function execute(command) {
    const applied = executeEditorCommand(store, command);
    notifyTrace('COMMAND_EXECUTED', {
      commandType: command.type,
      routeId: command.payload?.routeId || store.getState().selection?.activeRouteId || null,
    }, true);
    return applied;
  }

  function startRoute(point, spec = {}, meta = {}) {
    const p = normalizePoint(point);
    const cmd = createCommand(CommandTypes.ROUTE_START, { ...p, spec, routeId: meta.routeId }, meta);
    execute(cmd);
    return store.getState().selection?.activeRouteId;
  }

  function startPolyline(point, spec = {}, meta = {}) {
    const p = normalizePoint(point);
    const cmd = createCommand(CommandTypes.ROUTE_POLYLINE_START, { ...p, spec, routeId: meta.routeId }, meta);
    execute(cmd);
    return store.getState().selection?.activeRouteId;
  }

  function addPolylinePoint(routeId, point, meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_POLYLINE_ADD, { routeId, ...normalizePoint(point) }, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function endPolyline(routeId, meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_POLYLINE_END, { routeId }, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function addSegment(deltaOrPayload, meta = {}) {
    const payload = deltaOrPayload?.dx != null || deltaOrPayload?.dy != null || deltaOrPayload?.dz != null
      ? { ...normalizeAxisDelta(deltaOrPayload), routeId: deltaOrPayload.routeId }
      : { ...deltaOrPayload };
    const cmd = createCommand(CommandTypes.ROUTE_SEGMENT_ADD, payload, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function addToPoint(routeId, point, meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_SEGMENT_ADD, { routeId, to: normalizePoint(point) }, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function rise(lengthMm, routeId = null, meta = {}) {
    const len = Number(lengthMm);
    if (!Number.isFinite(len) || len <= 0) throw new Error('rise(lengthMm) requires a positive number');
    return addSegment({ routeId, dx: 0, dy: 0, dz: len }, { ...meta, source: meta.source || 'route-engine-rise' });
  }

  function drop(lengthMm, routeId = null, meta = {}) {
    const len = Number(lengthMm);
    if (!Number.isFinite(len) || len <= 0) throw new Error('drop(lengthMm) requires a positive number');
    return addSegment({ routeId, dx: 0, dy: 0, dz: -len }, { ...meta, source: meta.source || 'route-engine-drop' });
  }

  function insertComponent(payload = {}, meta = {}) {
    const cmd = createCommand(CommandTypes.INSERT_COMPONENT, payload, meta);
    execute(cmd);
    return store.getState().model?.components || [];
  }

  function moveNode(routeId, nodeId, absoluteOrDelta, meta = {}) {
    const payload = absoluteOrDelta?.x != null || absoluteOrDelta?.y != null || absoluteOrDelta?.z != null
      ? { routeId, nodeId, absolute: normalizePoint(absoluteOrDelta) }
      : { routeId, nodeId, ...normalizeAxisDelta(absoluteOrDelta) };
    const cmd = createCommand(CommandTypes.ROUTE_NODE_MOVE, payload, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function stretchNode(routeId, nodeId, absoluteOrDelta, meta = {}) {
    const payload = absoluteOrDelta?.x != null || absoluteOrDelta?.y != null || absoluteOrDelta?.z != null
      ? { routeId, nodeId, absolute: normalizePoint(absoluteOrDelta) }
      : { routeId, nodeId, ...normalizeAxisDelta(absoluteOrDelta) };
    const cmd = createCommand(CommandTypes.ROUTE_NODE_STRETCH, payload, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function rotateRoute(routeId, pivot, angleDeg, axis = 'Z', meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_ROTATE, { routeId, pivot: normalizePoint(pivot), angleDeg, axis }, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function breakRoute(routeId, segmentId, point = null, gapMm = 0, meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_BREAK, { routeId, segmentId, point: point ? normalizePoint(point) : null, gapMm }, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function deleteNode(routeId, nodeId, heal = false, meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_NODE_DELETE, { routeId, nodeId, heal }, meta);
    execute(cmd);
    return getActiveRoute();
  }

  function splitSegment(routeId, segmentId, point = null, meta = {}) {
    const cmd = createCommand(CommandTypes.ROUTE_SPLIT_SEGMENT, {
      routeId,
      segmentId,
      point: point ? normalizePoint(point) : null,
    }, meta);
    execute(cmd);
    return getActiveRoute();
  }


  function getAutoBendCandidate(routeId = null, nodeId = null) {
    const routes = getRoutes();
    const route = routes.find((item) => item.id === (routeId || store.getState().selection?.activeRouteId)) || routes[0] || null;
    if (!route) return null;
    return routeBendCandidate(route, nodeId);
  }

  function autoBend(payload = {}, meta = {}) {
    const cmd = createCommand(CommandTypes.AUTO_BEND, payload, meta);
    execute(cmd);
    return store.getState().model?.components || [];
  }

  function getAutoTeeCandidate(routeId = null, nodeId = null) {
    const routes = getRoutes();
    const route = routes.find((item) => item.id === (routeId || store.getState().selection?.activeRouteId)) || routes[0] || null;
    if (!route) return null;
    return routeTeeCandidate(routes, route, nodeId);
  }

  function autoTee(payload = {}, meta = {}) {
    const cmd = createCommand(CommandTypes.AUTO_TEE, payload, meta);
    execute(cmd);
    return store.getState().model?.components || [];
  }

  function getState() {
    return store.getState();
  }

  function getRoutes() {
    return store.getState().model?.routes || [];
  }

  function getInlineComponents() {
    return store.getState().model?.components || [];
  }

  function getDerivedComponents() {
    return routeModelToComponents(getRoutes(), getInlineComponents());
  }

  function getMetrics() {
    return aggregateRouteMetrics(getRoutes());
  }

  function getActiveRoute() {
    const routeId = store.getState().selection?.activeRouteId;
    return getRoutes().find((route) => route.id === routeId) || null;
  }

  return {
    version: ROUTE_ENGINE_VERSION,
    store,
    execute,
    startRoute,
    startPolyline,
    addPolylinePoint,
    endPolyline,
    addSegment,
    addToPoint,
    rise,
    drop,
    moveNode,
    stretchNode,
    rotateRoute,
    breakRoute,
    deleteNode,
    splitSegment,
    insertComponent,
    getAutoBendCandidate,
    autoBend,
    getAutoTeeCandidate,
    autoTee,
    getState,
    getRoutes,
    getInlineComponents,
    getDerivedComponents,
    getMetrics,
    getActiveRoute,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
