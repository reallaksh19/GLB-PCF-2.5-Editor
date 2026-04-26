import re

with open('hud/hud-overlay.js', 'r') as f:
    c = f.read()

# Add the missing event listener to hud-overlay.js using string replacement on 'input' event listener
listener_str = """
  root.addEventListener('change', (ev) => {
    const actionEl = ev.target.closest('[data-action="change-opacity"]');
    if (actionEl) handlers.changeOpacity?.(ev.target.value);

    const compactEl = ev.target.closest('[data-action="toggle-compact"]');
    if (compactEl) handlers.toggleCompact?.(ev.target.checked);
  });
"""
c = c.replace(
    "root.addEventListener('input', (ev) => {",
    listener_str + "\n  root.addEventListener('input', (ev) => {"
)

with open('hud/hud-overlay.js', 'w') as f:
    f.write(c)
