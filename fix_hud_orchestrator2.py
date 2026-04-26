import re

with open('hud/hud-orchestrator.js', 'r') as f:
    content = f.read()

handlers = """
    cancel: () => {
      const state = store.getState();
      store.patch({ mode: 'idle', draft: null, insertContext: null, errors: [], visible: state.visible });
      emitHudTrace('HUD_CANCEL', {}, true);
    },
    toggleCompact: (isCompact) => {
      store.patch({ isCompact });
    },
    changeOpacity: (opacity) => {
      store.patch({ opacity });
      overlay.root.style.setProperty('--hud-opacity', opacity);
    },
"""
content = content.replace(
"""    cancel: () => {
      const state = store.getState();
      store.patch({ mode: 'idle', draft: null, insertContext: null, errors: [], visible: state.visible });
      emitHudTrace('HUD_CANCEL', {}, true);
    },""",
    handlers
)

render_update = """
  const unsubscribeRender = store.subscribe((state) => {
    overlay.render(state);
    if (state.isCompact) overlay.root.classList.add('hud-compact');
    else overlay.root.classList.remove('hud-compact');
    if (state.opacity !== undefined) overlay.root.style.setProperty('--hud-opacity', state.opacity);
  });
"""
content = content.replace(
    "const unsubscribeRender = store.subscribe((state) => overlay.render(state));",
    render_update
)

with open('hud/hud-orchestrator.js', 'w') as f:
    f.write(content)
