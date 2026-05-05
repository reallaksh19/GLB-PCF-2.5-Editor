import re

content = open("index.html").read()

new_buttons = """
        <button id="btn-tool-line" class="btn-tool" title="Line draw tool">✏</button>
        <button id="btn-tool-polyline" class="btn-tool" title="Polyline draw tool">⑃</button>
        <button id="btn-tool-spline" class="btn-tool" title="Spline guide tool (Guide only)">~</button>
        <button id="btn-tool-valve" class="btn-tool" title="Insert valve">⛭</button>
        <button id="btn-tool-flange" class="btn-tool" title="Insert flange">◍</button>
        <button id="btn-tool-tee" class="btn-tool" title="Insert tee fitting">⊢</button>
        <button id="btn-tool-support" class="btn-tool" title="Insert support">⌂</button>
        <span class="sep"></span>
        <button id="btn-tool-move" class="btn-tool" title="Move node">⬌</button>
        <button id="btn-tool-stretch" class="btn-tool" title="Stretch nodes">↔</button>
        <button id="btn-tool-rotate" class="btn-tool" title="Rotate nodes">↺</button>
        <button id="btn-tool-break" class="btn-tool" title="Break segment">✂</button>
        <button id="btn-tool-delete" class="btn-tool" title="Delete selection">✗</button>
        <span class="sep"></span>
        <button id="btn-convert-bend" class="btn-tool" title="Convert current corner to elbow">↱</button>
        <button id="btn-convert-tee" class="btn-tool" title="Convert current branch to tee">⊣</button>
"""

content = re.sub(r'<button id="btn-tool-line" class="btn-tool" title="Line draw tool">✏</button>.*?<button id="btn-convert-tee" class="btn-tool" title="Convert current branch to tee">⊣</button>', new_buttons.strip(), content, flags=re.DOTALL)

open("index.html", "w").write(content)
