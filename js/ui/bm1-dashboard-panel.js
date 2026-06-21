import { createBm1UiHudSurface } from '../../benchmarks/bm1-ui-hud-surface.js';
import { executeBm1UiHudAction } from '../../benchmarks/bm1-ui-hud-command-contract.js';
import { executeMacro } from '../../macro/macro-engine.js';

export const BM1_DASHBOARD_PANEL_VERSION = 'bm1-dashboard-panel/v1';
export const BM1_DASHBOARD_PANEL_CLASS = 'hifi-bm1-dashboard-panel';
export const BM1_DASHBOARD_TITLE_ID = 'hifi-bm1-dashboard-title';

export function initBm1DashboardPanel({ host, shellApi, setStatus, onVisibilityChange } = {}) {
  if (!host || typeof host.appendChild !== 'function') return null;
  ensureBm1DashboardStyles();
  const surface = createBm1UiHudSurface();
  const panel = document.createElement('section');
  panel.className = BM1_DASHBOARD_PANEL_CLASS;
  panel.dataset.version = BM1_DASHBOARD_PANEL_VERSION;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', BM1_DASHBOARD_TITLE_ID);
  panel.setAttribute('tabindex', '-1');
  panel.innerHTML = renderSurface(surface);
  host.appendChild(panel);

  const context = {
    getRouteEngine: () => shellApi?.getRouteEngine?.(),
    executeMacro: (line) => {
      const result = executeMacro(line, { getRouteEngine: () => shellApi?.getRouteEngine?.() });
      shellApi?.refreshScene?.('bm1-dashboard-macro', { sourceName: 'bm1-dashboard', sourceType: 'macro' });
      return result;
    },
  };

  const notifyVisibility = () => onVisibilityChange?.(!isHidden(), { collapsed: panel.classList.contains('collapsed') });
  const setCollapsed = (collapsed) => {
    panel.classList.toggle('collapsed', Boolean(collapsed));
    panel.querySelector('[data-bm1-panel-toggle]')?.setAttribute('aria-expanded', String(!collapsed));
    setStatus?.(collapsed ? 'idle' : 'active', collapsed ? 'BM1 dashboard collapsed' : 'BM1 dashboard expanded');
    notifyVisibility();
  };
  const isHidden = () => panel.classList.contains('hidden');
  const show = () => { panel.classList.remove('hidden'); setStatus?.('active', 'BM1 dashboard shown'); notifyVisibility(); };
  const hide = () => { panel.classList.add('hidden'); setStatus?.('idle', 'BM1 dashboard hidden'); notifyVisibility(); };
  const toggleVisible = () => { if (isHidden()) show(); else hide(); return !isHidden(); };

  const onClick = (event) => {
    const closeButton = event.target?.closest?.('[data-bm1-panel-close]');
    if (closeButton) { hide(); return; }

    const toggleButton = event.target?.closest?.('[data-bm1-panel-toggle]');
    if (toggleButton) {
      setCollapsed(!panel.classList.contains('collapsed'));
      return;
    }

    const button = event.target?.closest?.('[data-bm1-action]');
    if (!button || panel.classList.contains('collapsed')) return;
    const actionId = button.getAttribute('data-bm1-action');
    try {
      const result = executeBm1UiHudAction(actionId, context);
      writeOutput(panel, actionId, result);
      setStatus?.('ok', `BM1 ${actionId} executed`);
    } catch (err) {
      writeOutput(panel, actionId, { error: String(err?.message || err) });
      setStatus?.('error', `BM1 ${actionId} failed`);
    }
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || isHidden()) return;
    event.preventDefault?.();
    hide();
  };

  panel.addEventListener('click', onClick);
  panel.addEventListener('keydown', onKeyDown);
  notifyVisibility();

  return {
    panel,
    surface,
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
    show,
    hide,
    toggle: toggleVisible,
    isHidden,
    destroy() {
      panel.removeEventListener('click', onClick);
      panel.removeEventListener('keydown', onKeyDown);
      panel.remove();
    },
  };
}

function ensureBm1DashboardStyles() {
  if (document.getElementById('hifi-bm1-dashboard-style')) return;
  const style = document.createElement('style');
  style.id = 'hifi-bm1-dashboard-style';
  style.textContent = `
    .${BM1_DASHBOARD_PANEL_CLASS} {
      position: absolute;
      left: 12px;
      top: 48px;
      z-index: 22;
      width: min(360px, calc(100% - 24px));
      max-height: calc(100% - 92px);
      overflow: auto;
      padding: 10px;
      border: 1px solid rgba(15, 23, 42, 0.18);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.92);
      color: #1f2937;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
      backdrop-filter: blur(8px);
      font-family: var(--font-code, 'JetBrains Mono', monospace);
      font-size: 11px;
    }
    .${BM1_DASHBOARD_PANEL_CLASS}.hidden { display: none; }
    .${BM1_DASHBOARD_PANEL_CLASS}.collapsed { width: 260px; max-height: 46px; overflow: hidden; }
    .${BM1_DASHBOARD_PANEL_CLASS}.collapsed .hifi-bm1-body { display: none; }
    .${BM1_DASHBOARD_PANEL_CLASS} .hifi-bm1-header { display: flex; align-items: start; gap: 8px; margin-bottom: 8px; }
    .${BM1_DASHBOARD_PANEL_CLASS} .hifi-bm1-title { flex: 1; min-width: 0; }
    .${BM1_DASHBOARD_PANEL_CLASS} .hifi-bm1-panel-controls { display: inline-flex; gap: 4px; }
    .${BM1_DASHBOARD_PANEL_CLASS} .hifi-bm1-panel-control { width: 22px; height: 20px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #1f2937; cursor: pointer; font-size: 11px; }
    .${BM1_DASHBOARD_PANEL_CLASS} .panel-section { margin-bottom: 10px; }
    .${BM1_DASHBOARD_PANEL_CLASS} .panel-section-title { color: #92400e; font-weight: 800; }
    .${BM1_DASHBOARD_PANEL_CLASS} .panel-value { color: #111827; white-space: pre-wrap; }
    .${BM1_DASHBOARD_PANEL_CLASS} .panel-label { color: #64748b; }
    .${BM1_DASHBOARD_PANEL_CLASS} .hifi-bm1-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .${BM1_DASHBOARD_PANEL_CLASS} .hifi-btn { height: 22px; font-size: 10px; color: #1f2937; background: #f8fafc; }
    .${BM1_DASHBOARD_PANEL_CLASS} pre { max-height: 160px; overflow: auto; margin: 4px 0 0; }
  `;
  document.head.appendChild(style);
}

function renderSurface(surface) {
  return `
    <div class="hifi-bm1-header">
      <div class="hifi-bm1-title">
        <div id="${BM1_DASHBOARD_TITLE_ID}" class="panel-section-title">${escapeHtml(surface.title)}</div>
        <div class="panel-value">${escapeHtml(surface.version)} · ${escapeHtml(surface.mode)}</div>
      </div>
      <div class="hifi-bm1-panel-controls">
        <button class="hifi-bm1-panel-control" data-bm1-panel-toggle aria-expanded="true" aria-label="Collapse or expand BM1 dashboard" title="Collapse/expand BM1 dashboard">–</button>
        <button class="hifi-bm1-panel-control" data-bm1-panel-close aria-label="Hide BM1 dashboard" title="Hide BM1 dashboard">×</button>
      </div>
    </div>
    <div class="hifi-bm1-body">
      ${surface.cards.map(renderCard).join('')}
      <div class="panel-section">
        <div class="panel-section-title">BM1 Result</div>
        <pre class="panel-value" data-bm1-output aria-live="polite">Ready</pre>
      </div>
    </div>
  `;
}

function renderCard(card) {
  if (card.type === 'status') return renderStatusCard(card);
  return `
    <div class="panel-section" data-bm1-card="${escapeHtml(card.id)}">
      <div class="panel-section-title">${escapeHtml(card.title)}</div>
      <div class="panel-value">${escapeHtml(card.description || '')}</div>
      <div class="hifi-bm1-actions">
        ${(card.actions || []).map((action) => `<button class="hifi-btn" data-bm1-action="${escapeHtml(action.id)}" title="${escapeHtml(action.kind)}">${escapeHtml(action.label || action.id)}</button>`).join('')}
      </div>
    </div>
  `;
}

function renderStatusCard(card) {
  const summary = card.summary || {};
  return `
    <div class="panel-section" data-bm1-card="${escapeHtml(card.id)}">
      <div class="panel-section-title">${escapeHtml(card.title)}</div>
      <table class="panel-table"><tbody>
        ${Object.entries(summary).map(([key, value]) => `<tr><td class="panel-label">${escapeHtml(key)}</td><td class="panel-value">${escapeHtml(String(value))}</td></tr>`).join('')}
      </tbody></table>
    </div>
  `;
}

function writeOutput(panel, actionId, result) {
  const out = panel.querySelector?.('[data-bm1-output]');
  if (!out) return;
  const compact = compactResult(result);
  out.textContent = `${actionId}\n${JSON.stringify(compact, null, 2)}`;
}

function compactResult(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.schemaVersion) return { schemaVersion: value.schemaVersion, id: value.id, summary: value.summary || null };
  if (value.line) return { line: value.line };
  if (value.kind || value.routeId) return { kind: value.kind, routeId: value.routeId, nodeId: value.nodeId || null, componentCount: value.componentCount || null };
  if (value.error) return value;
  return value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
