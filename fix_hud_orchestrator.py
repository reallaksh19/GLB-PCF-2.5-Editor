import re

with open('hud/hud-orchestrator.js', 'r') as f:
    content = f.read()

# Add logic to orchestrator to toggle compact and opacity

# Add new handlers in createHudOverlay initialization:
handlers = """
    cancel: () => store.dispatch({ type: 'IDLE' }),
    toggleCompact: (isCompact) => {
      store.dispatch({ type: 'UPDATE_COMPACT', payload: { isCompact } });
    },
    changeOpacity: (opacity) => {
      store.dispatch({ type: 'UPDATE_OPACITY', payload: { opacity } });
      overlay.root.style.setProperty('--hud-opacity', opacity);
    }
"""
content = content.replace("cancel: () => store.dispatch({ type: 'IDLE' })", handlers)

# Also ensure overlay updates the compact class based on state.isCompact
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


# We also need to add UPDATE_COMPACT and UPDATE_OPACITY to hud-state.js
with open('hud/hud-state.js', 'r') as f:
    state_content = f.read()

reducers = """
    case 'UPDATE_COMPACT':
      return { ...state, isCompact: action.payload.isCompact };
    case 'UPDATE_OPACITY':
      return { ...state, opacity: action.payload.opacity };
"""
state_content = state_content.replace(
    "case 'IDLE':",
    f"{reducers}\n    case 'IDLE':"
)

with open('hud/hud-state.js', 'w') as f:
    f.write(state_content)
