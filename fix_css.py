import re

with open('css/app.css', 'r') as f:
    c = f.read()

# 1. Add Floating Nav styles
floating_nav_css = """
/* ── Floating Navigation ───────────────────────────────────────── */
.floating-nav {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 52px;
  background: var(--bg-1, #141720);
  border: 1px solid var(--steel, #3a4255);
  border-radius: var(--radius-md, 6px);
  box-shadow: var(--shadow-lg, 0 4px 24px rgba(0,0,0,0.6));
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  gap: 4px;
  z-index: 20;
}
.floating-nav .nav-drag-handle {
  width: 100%;
  height: 12px;
  cursor: grab;
  color: var(--text-muted, #64748b);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 10px;
  line-height: 1;
  user-select: none;
}
.floating-nav .nav-drag-handle:active {
  cursor: grabbing;
}
.floating-nav button {
  width: 42px;
  height: 32px;
  background: var(--bg-2, #1c2030);
  border: 1px solid var(--steel, #3a4255);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #e8eaf0);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
}
.floating-nav button:hover {
  background: var(--bg-4, #2e3448);
}
.floating-nav .sep-h {
  width: 80%;
  height: 1px;
  background: var(--steel, #3a4255);
  margin: 4px 0;
}

"""

if ".floating-nav" not in c:
    c += floating_nav_css


# 2. Add Theme variables
themes_css = """
/* ── Theme Definitions ─────────────────────────────────────────── */
[data-theme="NavisDark"] {
  --bg-0: #0d0f12;
  --bg-1: #141720;
  --bg-2: #1c2030;
  --bg-3: #252a3a;
  --bg-4: #2e3448;
  --steel: #3a4255;
  --text-primary: #e8eaf0;
  --text-secondary: #94a3b8;
}
[data-theme="DraftLight"] {
  --bg-0: #e2e8f0;
  --bg-1: #f1f5f9;
  --bg-2: #ffffff;
  --bg-3: #cbd5e1;
  --bg-4: #94a3b8;
  --steel: #94a3b8;
  --text-primary: #0f172a;
  --text-secondary: #334155;
}
[data-theme="DraftDark"] {
  --bg-0: #0f172a;
  --bg-1: #1e293b;
  --bg-2: #334155;
  --bg-3: #475569;
  --bg-4: #64748b;
  --steel: #475569;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
}
[data-theme="Blueprint"] {
  --bg-0: #1e3a8a;
  --bg-1: #1d4ed8;
  --bg-2: #2563eb;
  --bg-3: #3b82f6;
  --bg-4: #60a5fa;
  --steel: #60a5fa;
  --text-primary: #ffffff;
  --text-secondary: #bfdbfe;
}
[data-theme="MonochromeTechnical"] {
  --bg-0: #171717;
  --bg-1: #262626;
  --bg-2: #404040;
  --bg-3: #525252;
  --bg-4: #737373;
  --steel: #525252;
  --text-primary: #f5f5f5;
  --text-secondary: #d4d4d4;
}
[data-theme="HighContrastReview"] {
  --bg-0: #000000;
  --bg-1: #000000;
  --bg-2: #000000;
  --bg-3: #ffff00;
  --bg-4: #ffff00;
  --steel: #ffffff;
  --text-primary: #ffffff;
  --text-secondary: #ffff00;
}
"""

if '[data-theme="NavisDark"]' not in c:
    c += themes_css


# 3. Add HUD slider and compact styles
hud_compact_css = """
/* ── HUD Customizations ────────────────────────────────────────── */
.hud-overlay {
  opacity: var(--hud-opacity, 1);
  transition: opacity 0.2s ease, width 0.2s ease, transform 0.2s ease;
}

.hud-overlay.hud-compact .hud-body {
  padding: 4px;
}
.hud-overlay.hud-compact .hud-row {
  margin-bottom: 2px;
}
.hud-overlay.hud-compact .hud-fields-row label {
  font-size: 10px;
}
.hud-overlay.hud-compact .hud-fields-row input,
.hud-overlay.hud-compact .hud-fields-row select {
  padding: 2px 4px;
  font-size: 11px;
}
.hud-overlay.hud-compact .hud-mini {
  padding: 2px 4px;
  font-size: 11px;
}

.hud-settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid var(--steel);
}
.hud-settings-row label {
  font-size: 10px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}
.hud-settings-row input[type="range"] {
  width: 60px;
}
"""

if '.hud-settings-row' not in c:
    c += hud_compact_css


with open('css/app.css', 'w') as f:
    f.write(c)
