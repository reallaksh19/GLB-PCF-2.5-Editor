import re

content = open("js/ui/toolbar.js").read()

new_toolbar = """
  unsubs.push(bindClick('btn-tool-line', () => actions.showHudLineMode?.()));
  unsubs.push(bindClick('btn-tool-polyline', () => actions.showHudPolylineMode?.()));
  unsubs.push(bindClick('btn-tool-spline', () => actions.showHudSplineMode?.()));
  unsubs.push(bindClick('btn-tool-valve', () => actions.showHudInsertMode?.('VALVE')));
  unsubs.push(bindClick('btn-tool-flange', () => actions.showHudInsertMode?.('FLANGE')));
  unsubs.push(bindClick('btn-tool-tee', () => actions.showHudInsertMode?.('TEE')));
  unsubs.push(bindClick('btn-tool-support', () => actions.showHudInsertMode?.('SUPPORT')));
  unsubs.push(bindClick('btn-tool-move', () => actions.activateModifyTool?.('MOVE')));
  unsubs.push(bindClick('btn-tool-stretch', () => actions.activateModifyTool?.('STRETCH')));
  unsubs.push(bindClick('btn-tool-rotate', () => actions.activateModifyTool?.('ROTATE')));
  unsubs.push(bindClick('btn-tool-break', () => actions.activateModifyTool?.('BREAK')));
  unsubs.push(bindClick('btn-tool-delete', () => actions.activateModifyTool?.('DELETE')));
"""

content = re.sub(r'  unsubs\.push\(bindClick\(\'btn-tool-line\'.*?unsubs\.push\(bindClick\(\'btn-tool-support\'.*?\)\)\);', new_toolbar.strip("\n"), content, flags=re.DOTALL)

actions = """
      showHudLineMode: () => shellApi.showHudLineMode?.(),
      showHudPolylineMode: () => shellApi.showHudPolylineMode?.(),
      showHudSplineMode: () => shellApi.showHudSplineMode?.(),
      showHudInsertMode: (component) => shellApi.showHudInsertMode?.(component),
      activateModifyTool: (tool) => shellApi.activateModifyTool?.(tool),
"""

content = re.sub(r'      showHudLineMode: \(\) => shellApi\.showHudLineMode\?\.\(\),\n      showHudInsertMode: \(component\) => shellApi\.showHudInsertMode\?\.\(component\),', actions.strip("\n"), content, flags=re.DOTALL)


open("js/ui/toolbar.js", "w").write(content)
