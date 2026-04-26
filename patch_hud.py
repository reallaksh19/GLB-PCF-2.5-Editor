import re

content = open("hud/hud-orchestrator.js").read()

new_api = """
    showLineMode() {
      overlay.root.querySelector('[data-action="line"]')?.click();
    },
    showPolylineMode() {
      store.patch({ visible: true, mode: 'polyline-draw', draftPoints: [], errors: [] });
      emitHudTrace('POLYLINE_MODE_OPEN');
    },
    showSplineMode() {
      store.patch({ visible: true, mode: 'spline-draw', draftPoints: [], errors: [] });
      emitHudTrace('SPLINE_MODE_OPEN');
    },
    activateModifyTool(tool) {
      store.patch({ visible: true, mode: 'modify-tool', activeTool: tool, errors: [] });
      emitHudTrace('MODIFY_TOOL_OPEN', { tool });
    },
"""

content = re.sub(r'    showLineMode\(\) {\n      overlay\.root\.querySelector\(\'\[data-action="line"\]\'\)\?\.click\(\);\n    },', new_api.strip("\n"), content, flags=re.DOTALL)

open("hud/hud-orchestrator.js", "w").write(content)
