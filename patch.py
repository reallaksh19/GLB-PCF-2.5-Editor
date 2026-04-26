import re

content = open("editor/route-engine.js").read()

new_handlers = """
  registerCommandHandler(CommandTypes.ROUTE_POLYLINE_CREATE, (state, command) => {
    const { routeId, points, spec } = command.payload;
    if (!points || points.length < 2) throw new Error('Polyline requires at least two points');

    const rId = routeId || uid('route');
    const route = createEmptyRoute(rId, spec || {});

    const nodes = points.map(p => createRouteNode(uid('node'), p.x, p.y, p.z));
    route.nodes = nodes;

    for (let i = 0; i < nodes.length - 1; i++) {
        const seg = createRouteSegment(uid('segment'), nodes[i].id, nodes[i+1].id, 'PIPE', classifySegmentOrientation(nodes[i], nodes[i+1]));
        route.segments.push(seg);
    }

    const nextRoutes = [...(state.model?.routes || []), route];
    return patchStateWithRoute(state, nextRoutes, route.id, command.type);
  });

  registerCommandHandler(CommandTypes.ROUTE_STRETCH, (state, command) => {
    // Stretches specific node(s) by a delta
    const { index, route } = getRouteOrThrow(state, command.payload.routeId);
    const nextRoutes = clone(state.model.routes || []);
    const nextRoute = clone(route);

    const nodeIds = Array.isArray(command.payload.nodeId) ? command.payload.nodeId : [command.payload.nodeId];
    const nodesToMove = nextRoute.nodes.filter(n => nodeIds.includes(n.id));
    if (!nodesToMove.length) throw new Error('No valid nodes found for stretch');

    const delta = normalizeAxisDelta(command.payload);

    for (const node of nodesToMove) {
        node.x += delta.dx;
        node.y += delta.dy;
        node.z += delta.dz;
    }

    const nodeIndex = routeNodeIndex(nextRoute);
    for (const seg of nextRoute.segments) {
      if (nodeIds.includes(seg.from) || nodeIds.includes(seg.to)) {
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

    const { pivot, angle, axis, nodeIds } = command.payload;
    if (!pivot || angle === undefined) throw new Error('Rotate requires pivot and angle');

    const p = normalizePoint(pivot);
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const targets = nodeIds ? nextRoute.nodes.filter(n => nodeIds.includes(n.id)) : nextRoute.nodes;

    for (const node of targets) {
       const dx = node.x - p.x;
       const dy = node.y - p.y;
       const dz = node.z - p.z;

       if (axis === 'Z') {
         node.x = p.x + dx * cos - dy * sin;
         node.y = p.y + dx * sin + dy * cos;
       } else if (axis === 'X') {
         node.y = p.y + dy * cos - dz * sin;
         node.z = p.z + dy * sin + dz * cos;
       } else if (axis === 'Y') {
         node.x = p.x + dx * cos + dz * sin;
         node.z = p.z - dx * sin + dz * cos;
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
      // Alias/Enhancement to SPLIT_SEGMENT. But keeping it explicit for now.
      // Defers to logic similar to ROUTE_SPLIT_SEGMENT, but ensures we know it's a break action.
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

      const middleNode = createRouteNode(uid('node'), splitPoint.x, splitPoint.y, splitPoint.z);
      const first = createRouteSegment(uid('segment'), segment.from, middleNode.id, segment.kind || 'PIPE', classifySegmentOrientation(a, middleNode));
      const second = createRouteSegment(uid('segment'), middleNode.id, segment.to, segment.kind || 'PIPE', classifySegmentOrientation(middleNode, b));

      nextRoute.nodes.push(middleNode);
      nextRoute.segments.splice(segIndex, 1, first, second);
      nextRoutes[index] = nextRoute;
      return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
  });

  registerCommandHandler(CommandTypes.GUIDE_CREATE, (state, command) => {
    const guide = {
      id: command.payload.id || uid('guide'),
      type: command.payload.guideType || 'LINE',
      points: (command.payload.points || []).map(p => normalizePoint(p)),
      attributes: { SOURCE: 'guide-layer' }
    };
    return {
      model: {
        ...(state.model || {}),
        guides: [...(state.model?.guides || []), guide],
      }
    };
  });

  registerCommandHandler(CommandTypes.GUIDE_MOVE, (state, command) => {
    const guides = clone(state.model?.guides || []);
    const guideIndex = guides.findIndex(g => g.id === command.payload.id);
    if (guideIndex >= 0) {
      const delta = normalizeAxisDelta(command.payload);
      const guide = guides[guideIndex];
      guide.points = guide.points.map(p => ({
         x: p.x + delta.dx, y: p.y + delta.dy, z: p.z + delta.dz
      }));
      guides[guideIndex] = guide;
    }
    return {
       model: { ...(state.model || {}), guides }
    };
  });

  registerCommandHandler(CommandTypes.GUIDE_DELETE, (state, command) => {
    const idList = Array.isArray(command.payload.id) ? command.payload.id : [command.payload.id];
    return {
      model: {
        ...(state.model || {}),
        guides: (state.model?.guides || []).filter(g => !idList.includes(g.id)),
      }
    };
  });
"""

content = content.replace("registerCommandHandler(CommandTypes.ROUTE_SPLIT_SEGMENT", new_handlers.strip() + "\n\n  registerCommandHandler(CommandTypes.ROUTE_SPLIT_SEGMENT")
open("editor/route-engine.js", "w").write(content)
