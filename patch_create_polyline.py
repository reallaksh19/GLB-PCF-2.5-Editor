import re

content = open("editor/route-engine.js").read()

new_content = """
  function createPolyline(points, spec = {}, meta = {}) {
    if (!points || points.length < 2) throw new Error('Polyline requires at least two points');
    const routeId = meta.routeId || uid('route');
    const cmd = createCommand(CommandTypes.ROUTE_POLYLINE_CREATE, {
      routeId,
      points: points.map(p => normalizePoint(p)),
      spec
    }, meta);
    execute(cmd);
    return routeId;
  }
"""

content = content.replace("function getRoutes() {", new_content.strip() + "\n\n  function getRoutes() {")
content = content.replace("startRoute,", "createPolyline,\n    startRoute,")

open("editor/route-engine.js", "w").write(content)
