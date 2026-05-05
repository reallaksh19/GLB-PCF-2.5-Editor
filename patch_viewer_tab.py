import re

content = open("js/tabs/viewer-tab.js").read()

new_exports = """
    showHudLineMode: () => _hudApi?.showLineMode?.(),
    showHudPolylineMode: () => _hudApi?.showPolylineMode?.(),
    showHudSplineMode: () => _hudApi?.showSplineMode?.(),
    showHudInsertMode: (componentType) => _hudApi?.showInsertMode?.(componentType),
    activateModifyTool: (tool) => {
        // Just stub for HUD/Shell to know a modify tool is active
        // Full implementation goes in HUD/route-engine
        _hudApi?.activateModifyTool?.(tool);
    },
"""

content = re.sub(r'    showHudLineMode: \(\) => _hudApi\?\.showLineMode\?\.\(\),\n    showHudInsertMode: \(componentType\) => _hudApi\?\.showInsertMode\?\.\(componentType\),', new_exports.strip("\n"), content, flags=re.DOTALL)

open("js/tabs/viewer-tab.js", "w").write(content)
