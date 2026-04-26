import re
with open('index.html', 'r') as f:
    c = f.read()

view_presets_regex = r"<!-- ── View presets ────────────────────────────────── -->(.*?)<span class=\"sep\"></span>"
c = re.sub(view_presets_regex, "", c, flags=re.DOTALL)

svgholder = {
    'btn-tool-line': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    'btn-tool-valve': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-6-8v16l6-8"/><path d="M2 12h4l6-8v16l-6-8"/></svg>',
    'btn-tool-flange': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="4" width="6" height="16" rx="1"/></svg>',
    'btn-tool-tee': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="M12 12v8"/></svg>',
    'btn-tool-support': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M12 4v16M8 12h8"/></svg>',
    'btn-convert-bend': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18v-6a3 3 0 0 1 3-3h8"/><path d="M16 5l4 4-4 4"/></svg>',
    'btn-convert-tee': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h10"/><path d="M15 8l4 4-4 4"/><path d="M9 4v16"/></svg>'
}

c = re.sub(r'<button id="btn-tool-line"[^>]*>.*?</button>', f'<button id="btn-tool-line" class="btn-tool" title="Line draw tool">{svgholder["btn-tool-line"]}</button>', c)
c = re.sub(r'<button id="btn-tool-valve"[^>]*>.*?</button>', f'<button id="btn-tool-valve" class="btn-tool" title="Insert valve">{svgholder["btn-tool-valve"]}</button>', c)
c = re.sub(r'<button id="btn-tool-flange"[^>]*>.*?</button>', f'<button id="btn-tool-flange" class="btn-tool" title="Insert flange">{svgholder["btn-tool-flange"]}</button>', c)
c = re.sub(r'<button id="btn-tool-tee"[^>]*>.*?</button>', f'<button id="btn-tool-tee" class="btn-tool" title="Insert tee fitting">{svgholder["btn-tool-tee"]}</button>', c)
c = re.sub(r'<button id="btn-tool-support"[^>]*>.*?</button>', f'<button id="btn-tool-support" class="btn-tool" title="Insert support">{svgholder["btn-tool-support"]}</button>', c)
c = re.sub(r'<button id="btn-convert-bend"[^>]*>.*?</button>', f'<button id="btn-convert-bend" class="btn-tool" title="Convert current corner to elbow">{svgholder["btn-convert-bend"]}</button>', c)
c = re.sub(r'<button id="btn-convert-tee"[^>]*>.*?</button>', f'<button id="btn-convert-tee" class="btn-tool" title="Convert current branch to tee">{svgholder["btn-convert-tee"]}</button>', c)


floating_nav_html = """
        <!-- Floating Navigation / View Cube -->
        <div id="floating-nav" class="floating-nav">
          <div class="nav-drag-handle">::</div>
          <button data-view="iso-ne" title="Isometric NE">NE</button>
          <button data-view="iso-nw" title="Isometric NW">NW</button>
          <button data-view="iso-se" title="Isometric SE">SE</button>
          <button data-view="iso-sw" title="Isometric SW">SW</button>
          <div class="sep-h"></div>
          <button data-view="plan" title="Plan view (top-down)">T</button>
          <button data-view="front" title="Front elevation">F</button>
          <div class="sep-h"></div>
          <button id="btn-fit-all-float" title="Fit all to view">⊞</button>
        </div>
"""

# if it's already there we can skip adding
if 'id="floating-nav"' not in c:
    c = c.replace('<div id="viewer-canvas"></div>', f'<div id="viewer-canvas"></div>{floating_nav_html}')

with open('index.html', 'w') as f:
    f.write(c)
