import { createEmptyRoute } from '../editor/route-contract.js';
import { CommandTypes } from './command-types.js';
import { getCommandHandler, registerCommandHandler } from './command-handlers.js';
import {
  buildAutoBendPayload, buildAutoTeePayload, buildDiagnostics, classifySegmentOrientation, clone, createRouteNode, createRouteSegment,
  ensureRouteFlags, getRouteOrThrow, isSamePoint, normalizeAxisDelta, normalizeInlineComponent, normalizePoint, patchStateWithRoute,
  pointsEqual, resolveTargetPoint, routeBendCandidate, routeNodeIndex, routeTeeCandidate, uid,
} from './route-engine-utils.js';

const defaultHandlersRegistered = () => !!getCommandHandler(CommandTypes.ROUTE_START);
function moveNodeAndReclassify(route, node, nextPoint) {
  node.x = nextPoint.x; node.y = nextPoint.y; node.z = nextPoint.z;
  const nodeIndex = routeNodeIndex(route);
  for (const seg of route.segments) if (seg.from === node.id || seg.to === node.id) seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
}
function splitSegmentInRoute(route, segIndex, point, nodeId = uid('node')) {
  const segment = route.segments[segIndex], nodeIndex = routeNodeIndex(route), a = nodeIndex[segment.from], b = nodeIndex[segment.to];
  const splitPoint = point ? normalizePoint(point) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  const middleNode = createRouteNode(nodeId, splitPoint.x, splitPoint.y, splitPoint.z);
  const first = createRouteSegment(uid('segment'), segment.from, middleNode.id, segment.kind || 'PIPE', classifySegmentOrientation(a, middleNode));
  const second = createRouteSegment(uid('segment'), middleNode.id, segment.to, segment.kind || 'PIPE', classifySegmentOrientation(middleNode, b));
  route.nodes.push(middleNode); route.segments.splice(segIndex, 1, first, second);
  return { middleNode, first, second };
}
const modelPatch = (state, routes, components, routeId, type) => ({ model: { ...(state.model || {}), routes, components }, diagnostics: buildDiagnostics(state, routeId, type) });

export function registerDefaultRouteHandlers() {
  if (defaultHandlersRegistered()) return;
  registerCommandHandler(CommandTypes.ROUTE_START, (state, command) => {
    const point = normalizePoint(command.payload), route = createEmptyRoute(command.payload.routeId || uid('route'), command.payload.spec || {});
    route.nodes.push(createRouteNode(command.payload.nodeId || uid('node'), point.x, point.y, point.z));
    return patchStateWithRoute(state, [...(state.model?.routes || []), route], route.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_SEGMENT_ADD, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route);
    const lastNode = nextRoute.nodes[nextRoute.nodes.length - 1], target = resolveTargetPoint(nextRoute, command.payload);
    if (pointsEqual(lastNode, target)) throw new Error('Route segment target matches last node');
    const nextNode = createRouteNode(command.payload.nodeId || uid('node'), target.x, target.y, target.z);
    nextRoute.nodes.push(nextNode);
    nextRoute.segments.push(createRouteSegment(command.payload.segmentId || uid('segment'), lastNode.id, nextNode.id, command.payload.kind || 'PIPE', classifySegmentOrientation(lastNode, nextNode)));
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_SEGMENT_EDIT, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route);
    const segment = nextRoute.segments.find((seg) => seg.id === command.payload.segmentId);
    if (!segment) throw new Error(`Segment not found: ${command.payload.segmentId}`);
    const nodeId = command.payload.endpoint === 'from' ? segment.from : segment.to, node = nextRoute.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    moveNodeAndReclassify(nextRoute, node, command.payload.absolute ? normalizePoint(command.payload.absolute) : { x: node.x + Number(command.payload.dx || 0), y: node.y + Number(command.payload.dy || 0), z: node.z + Number(command.payload.dz || 0) });
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_NODE_MOVE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route), node = nextRoute.nodes.find((item) => item.id === command.payload.nodeId);
    if (!node) throw new Error(`Node not found: ${command.payload.nodeId}`);
    moveNodeAndReclassify(nextRoute, node, command.payload.absolute ? normalizePoint(command.payload.absolute) : { x: node.x + Number(command.payload.dx || 0), y: node.y + Number(command.payload.dy || 0), z: node.z + Number(command.payload.dz || 0) });
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_POLYLINE_CREATE, (state, command) => {
    const { routeId, points, spec } = command.payload;
    if (!points || points.length < 2) throw new Error('Polyline requires at least two points');
    const route = createEmptyRoute(routeId || uid('route'), spec || {});
    route.nodes = points.map((p) => createRouteNode(uid('node'), p.x, p.y, p.z));
    for (let i = 0; i < route.nodes.length - 1; i++) route.segments.push(createRouteSegment(uid('segment'), route.nodes[i].id, route.nodes[i + 1].id, 'PIPE', classifySegmentOrientation(route.nodes[i], route.nodes[i + 1])));
    return patchStateWithRoute(state, [...(state.model?.routes || []), route], route.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_STRETCH, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route), nodeIds = Array.isArray(command.payload.nodeId) ? command.payload.nodeId : [command.payload.nodeId], delta = normalizeAxisDelta(command.payload);
    const nodes = nextRoute.nodes.filter((n) => nodeIds.includes(n.id));
    if (!nodes.length) throw new Error('No valid nodes found for stretch');
    for (const node of nodes) { node.x += delta.dx; node.y += delta.dy; node.z += delta.dz; }
    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) if (nodeIds.includes(seg.from) || nodeIds.includes(seg.to)) seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_ROTATE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route);
    const { pivot, angle, axis, nodeIds } = command.payload;
    if (!pivot || angle === undefined) throw new Error('Rotate requires pivot and angle');
    const p = normalizePoint(pivot), rad = angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    for (const node of (nodeIds ? nextRoute.nodes.filter((n) => nodeIds.includes(n.id)) : nextRoute.nodes)) {
      const dx = node.x - p.x, dy = node.y - p.y, dz = node.z - p.z;
      if (axis === 'Z') { node.x = p.x + dx * cos - dy * sin; node.y = p.y + dx * sin + dy * cos; }
      else if (axis === 'X') { node.y = p.y + dy * cos - dz * sin; node.z = p.z + dy * sin + dz * cos; }
      else if (axis === 'Y') { node.x = p.x + dx * cos + dz * sin; node.z = p.z - dx * sin + dz * cos; }
    }
    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) seg.orientation = classifySegmentOrientation(nodeIndex[seg.from], nodeIndex[seg.to]);
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_BREAK, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route), segIndex = nextRoute.segments.findIndex((seg) => seg.id === command.payload.segmentId);
    if (segIndex < 0) throw new Error(`Segment not found: ${command.payload.segmentId}`);
    splitSegmentInRoute(nextRoute, segIndex, command.payload.point);
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.GUIDE_CREATE, (state, command) => ({ model: { ...(state.model || {}), guides: [...(state.model?.guides || []), { id: command.payload.id || uid('guide'), type: command.payload.guideType || 'LINE', points: (command.payload.points || []).map((p) => normalizePoint(p)), attributes: { SOURCE: 'guide-layer' } }] } }));
  registerCommandHandler(CommandTypes.GUIDE_MOVE, (state, command) => {
    const guides = clone(state.model?.guides || []), guide = guides.find((g) => g.id === command.payload.id), delta = normalizeAxisDelta(command.payload);
    if (guide) guide.points = guide.points.map((p) => ({ x: p.x + delta.dx, y: p.y + delta.dy, z: p.z + delta.dz }));
    return { model: { ...(state.model || {}), guides } };
  });
  registerCommandHandler(CommandTypes.GUIDE_DELETE, (state, command) => {
    const idList = Array.isArray(command.payload.id) ? command.payload.id : [command.payload.id];
    return { model: { ...(state.model || {}), guides: (state.model?.guides || []).filter((g) => !idList.includes(g.id)) } };
  });
  registerCommandHandler(CommandTypes.ROUTE_SPLIT_SEGMENT, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route), segIndex = nextRoute.segments.findIndex((seg) => seg.id === command.payload.segmentId);
    if (segIndex < 0) throw new Error(`Segment not found: ${command.payload.segmentId}`);
    splitSegmentInRoute(nextRoute, segIndex, command.payload.point, command.payload.nodeId || uid('node'));
    nextRoutes[index] = nextRoute;
    return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.ROUTE_DELETE, (state, command) => {
    const { routeId, segmentId, nodeId } = command.payload;
    if (segmentId || nodeId) {
      const { index, route } = getRouteOrThrow(state, routeId), nextRoutes = clone(state.model.routes || []), nextRoute = clone(route);
      if (segmentId) nextRoute.segments = nextRoute.segments.filter((s) => s.id !== segmentId);
      if (nodeId) { nextRoute.nodes = nextRoute.nodes.filter((n) => n.id !== nodeId); nextRoute.segments = nextRoute.segments.filter((s) => s.from !== nodeId && s.to !== nodeId); }
      nextRoutes[index] = nextRoute;
      return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
    }
    return patchStateWithRoute(state, (state.model?.routes || []).filter((route) => route.id !== command.payload.routeId), null, command.type);
  });
  registerCommandHandler(CommandTypes.INSERT_COMPONENT, (state, command) => modelPatch(state, [...(state.model?.routes || [])], [...(state.model?.components || []), normalizeInlineComponent(command.payload, state)], command.payload.routeId || state.selection?.activeRouteId || null, command.type));
  registerCommandHandler(CommandTypes.DELETE_COMPONENT, (state, command) => modelPatch(state, [...(state.model?.routes || [])], (state.model?.components || []).filter((item) => item.id !== command.payload.id), command.payload.routeId || state.selection?.activeRouteId || null, command.type));
  registerCommandHandler(CommandTypes.AUTO_BEND, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = ensureRouteFlags(clone(route)), candidate = routeBendCandidate(nextRoute, command.payload.nodeId);
    if (!candidate) throw new Error('No eligible bend conversion candidate found');
    if (!nextRoute.convertedBendNodes.includes(candidate.nodeId)) nextRoute.convertedBendNodes.push(candidate.nodeId);
    const payload = buildAutoBendPayload(nextRoute, candidate, command.payload.resolved || {}, command.payload), component = normalizeInlineComponent(payload, { model: state.model, selection: state.selection });
    const prevSegIndex = nextRoute.segments.findIndex((seg) => seg.id === candidate.prevSegId), nextSegIndex = nextRoute.segments.findIndex((seg) => seg.id === candidate.nextSegId);
    if (prevSegIndex >= 0 && nextSegIndex >= 0) {
      const nodeEp1 = createRouteNode(uid('node'), payload.ep1.x, payload.ep1.y, payload.ep1.z), nodeEp2 = createRouteNode(uid('node'), payload.ep2.x, payload.ep2.y, payload.ep2.z);
      nextRoute.nodes.push(nodeEp1, nodeEp2); nextRoute.segments[prevSegIndex].to = nodeEp1.id; nextRoute.segments[nextSegIndex].from = nodeEp2.id;
    }
    nextRoutes[index] = nextRoute;
    return modelPatch(state, nextRoutes, (state.model?.components || []).filter((item) => item.id !== component.id).concat(component), nextRoute.id, command.type);
  });
  registerCommandHandler(CommandTypes.AUTO_TEE, (state, command) => {
    const { index, route } = getRouteOrThrow(state, command.payload.routeId), nextRoutes = clone(state.model.routes || []), nextRoute = ensureRouteFlags(clone(route));
    const candidate = command.payload.candidate || routeTeeCandidate(state.model?.routes || [], nextRoute, command.payload.nodeId);
    if (!candidate) throw new Error('No eligible tee conversion candidate found');
    let targetNodeId = candidate.nodeId;
    if (candidate.isMidSegmentSplit) {
      const splitNodeId = uid('node'), middleNode = createRouteNode(splitNodeId, candidate.point.x, candidate.point.y, candidate.point.z), segIndex = nextRoute.segments.findIndex((seg) => seg.id === candidate.intersectedSegment?.id), segment = nextRoute.segments[segIndex];
      if (segment) {
        const nodeIndexCurrent = routeNodeIndex(nextRoute), first = createRouteSegment(uid('segment'), segment.from, middleNode.id, segment.kind || 'PIPE', classifySegmentOrientation(nodeIndexCurrent[segment.from], middleNode)), second = createRouteSegment(uid('segment'), middleNode.id, segment.to, segment.kind || 'PIPE', classifySegmentOrientation(middleNode, nodeIndexCurrent[segment.to]));
        nextRoute.nodes.push(middleNode); nextRoute.segments.splice(segIndex, 1, first, second); targetNodeId = splitNodeId; Object.assign(candidate, { nodeId: splitNodeId, prevSeg: first, nextSeg: second, nodeIndex: routeNodeIndex(nextRoute) });
      }
    }
    if (!nextRoute.convertedTeeNodes.includes(targetNodeId)) nextRoute.convertedTeeNodes.push(targetNodeId);
    const payload = buildAutoTeePayload(state.model?.routes || [], nextRoute, candidate, command.payload.resolved || {}, command.payload), component = normalizeInlineComponent(payload, { model: state.model, selection: state.selection });
    const prevSegIndex = candidate.prevSeg ? nextRoute.segments.findIndex((seg) => seg.id === candidate.prevSeg.id) : -1, nextSegIndex = candidate.nextSeg ? nextRoute.segments.findIndex((seg) => seg.id === candidate.nextSeg.id) : -1;
    if (prevSegIndex >= 0) { const nodeEp1 = createRouteNode(uid('node'), payload.ep1.x, payload.ep1.y, payload.ep1.z); nextRoute.nodes.push(nodeEp1); nextRoute.segments[prevSegIndex].to = nodeEp1.id; }
    if (nextSegIndex >= 0) { const nodeEp2 = createRouteNode(uid('node'), payload.ep2.x, payload.ep2.y, payload.ep2.z); nextRoute.nodes.push(nodeEp2); nextRoute.segments[nextSegIndex].from = nodeEp2.id; }
    if (candidate.branchRouteId) {
      const branchRouteIndex = nextRoutes.findIndex((r) => r.id === candidate.branchRouteId);
      if (branchRouteIndex >= 0) {
        const branchRoute = clone(nextRoutes[branchRouteIndex]), otherNode = branchRoute.nodes.find((item) => isSamePoint(item, payload.point)), otherSegIndex = branchRoute.segments.findIndex((seg) => seg.id === candidate.branchSeg?.id);
        if (otherNode && otherSegIndex >= 0) { const nodeBp = createRouteNode(uid('node'), payload.bp.x, payload.bp.y, payload.bp.z); branchRoute.nodes.push(nodeBp); if (branchRoute.segments[otherSegIndex].from === otherNode.id) branchRoute.segments[otherSegIndex].from = nodeBp.id; else branchRoute.segments[otherSegIndex].to = nodeBp.id; nextRoutes[branchRouteIndex] = branchRoute; }
      }
    }
    nextRoutes[index] = nextRoute;
    return modelPatch(state, nextRoutes, (state.model?.components || []).filter((item) => item.id !== component.id).concat(component), nextRoute.id, command.type);
  });
}
