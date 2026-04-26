import re

with open('hud/hud-overlay.js', 'r') as f:
    c = f.read()

# Add the missing event listener to hud-overlay.js
listener_str = """
  root.addEventListener('change', (ev) => {
    const actionEl = ev.target.closest('[data-action="change-opacity"]');
    if (actionEl) handlers.changeOpacity?.(ev.target.value);
  });
"""
if "data-action=\"change-opacity\"" not in c or "handlers.changeOpacity" not in c:
    c = c.replace(
        "root.addEventListener('keydown', (ev) => {",
        listener_str + "\n  root.addEventListener('keydown', (ev) => {"
    )

with open('hud/hud-overlay.js', 'w') as f:
    f.write(c)
