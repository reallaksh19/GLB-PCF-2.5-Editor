import re

with open('hud/hud-overlay.js', 'r') as f:
    content = f.read()

hud_settings = """
      <div class="hud-settings-row">
        <label>
          <input type="checkbox" data-action="toggle-compact" ${state.isCompact ? 'checked' : ''} />
          Compact
        </label>
        <label>
          Opac:
          <input type="range" data-action="change-opacity" min="0.2" max="1" step="0.1" value="${state.opacity ?? 1}" />
        </label>
      </div>
"""

# Insert into lineDraftHtml before the last closing div of hud-body
content = content.replace(
    '    </div>`;\n}\n\nfunction insertDraftHtml',
    f'{hud_settings}    </div>`;\n}}\n\nfunction insertDraftHtml'
)

# Insert into insertDraftHtml before the last closing div
content = content.replace(
    '    </div>`;\n}\n\nexport function createHudOverlay',
    f'{hud_settings}    </div>`;\n}}\n\nexport function createHudOverlay'
)


# Also we need to attach event listeners to change-opacity and toggle-compact
binds = """
    if (action === 'toggle-compact') return handlers.toggleCompact?.(ev.target.checked);
"""
# find the last return handlers
content = content.replace(
    "if (action === 'cancel') return handlers.cancel?.();",
    "if (action === 'cancel') return handlers.cancel?.();\n    if (action === 'toggle-compact') return handlers.toggleCompact?.(ev.target.checked);"
)

# add change-opacity handler
# Note: change event instead of click for range inputs, so let's add it manually in createHudOverlay

change_listener = """
  root.addEventListener('change', (ev) => {
    const actionEl = ev.target.closest('[data-action="change-opacity"]');
    if (actionEl) handlers.changeOpacity?.(ev.target.value);
  });
"""

content = content.replace(
    "export function createHudOverlay(container, handlers = {}) {",
    "export function createHudOverlay(container, handlers = {}) {"
)
content = content.replace(
    "root.addEventListener('keydown', (ev) => {",
    change_listener + "\n  root.addEventListener('keydown', (ev) => {"
)


with open('hud/hud-overlay.js', 'w') as f:
    f.write(content)
