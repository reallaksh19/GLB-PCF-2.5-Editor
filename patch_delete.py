import re

content = open("editor/route-engine.js").read()

new_delete = """
  registerCommandHandler(CommandTypes.ROUTE_DELETE, (state, command) => {
    // Phase 4D enhancement: Handle node-level/segment-level delete vs full route
    const { routeId, segmentId, nodeId } = command.payload;

    if (segmentId || nodeId) {
      const { index, route } = getRouteOrThrow(state, routeId);
      const nextRoutes = clone(state.model.routes || []);
      const nextRoute = clone(route);

      if (segmentId) {
        nextRoute.segments = nextRoute.segments.filter(s => s.id !== segmentId);
      }
      if (nodeId) {
        nextRoute.nodes = nextRoute.nodes.filter(n => n.id !== nodeId);
        // Cascade delete segments attached to this node
        nextRoute.segments = nextRoute.segments.filter(s => s.from !== nodeId && s.to !== nodeId);
      }

      nextRoutes[index] = nextRoute;
      return patchStateWithRoute(state, nextRoutes, nextRoute.id, command.type);
    } else {
      const nextRoutes = (state.model?.routes || []).filter((route) => route.id !== command.payload.routeId);
      return patchStateWithRoute(state, nextRoutes, null, command.type);
    }
  });
"""

content = re.sub(r'registerCommandHandler\(CommandTypes.ROUTE_DELETE, \(state, command\) => \{.*?return patchStateWithRoute\(state, nextRoutes, null, command.type\);\n  \}\);', new_delete.strip(), content, flags=re.DOTALL)

open("editor/route-engine.js", "w").write(content)
