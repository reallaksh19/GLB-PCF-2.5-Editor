import re

content = open("editor/route-engine.js").read()

new_content = """
  function createGuide(points, guideType = 'LINE', meta = {}) {
    const id = meta.id || uid('guide');
    const cmd = createCommand(CommandTypes.GUIDE_CREATE, {
      id,
      points: points.map(p => normalizePoint(p)),
      guideType
    }, meta);
    execute(cmd);
    return id;
  }

  function moveGuide(id, delta, meta = {}) {
    const cmd = createCommand(CommandTypes.GUIDE_MOVE, {
      id,
      ...normalizeAxisDelta(delta)
    }, meta);
    execute(cmd);
    return id;
  }

  function deleteGuide(id, meta = {}) {
    const cmd = createCommand(CommandTypes.GUIDE_DELETE, { id }, meta);
    execute(cmd);
  }
"""

content = content.replace("function getRoutes() {", new_content.strip() + "\n\n  function getRoutes() {")
content = content.replace("createPolyline,", "createGuide,\n    moveGuide,\n    deleteGuide,\n    createPolyline,")

open("editor/route-engine.js", "w").write(content)
