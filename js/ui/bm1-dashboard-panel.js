import { createBm1UiHudSurface } from '../../benchmarks/bm1-ui-hud-surface.js';
import { executeBm1UiHudAction } from '../../benchmarks/bm1-ui-hud-command-contract.js';
import { executeMacro } from '../../macro/macro-engine.js';

export const BM1_DASHBOARD_PANEL_VERSION = 'bm1-dashboard-panel/v1';
export const BM1_DASHBOARD_PANEL_CLASS = 'hifi-bm1-dashboard-panel';

export function initBm1DashboardPanel({ host, shellApi, setStatus } = {}) {
  if (!host || typeof host.appendChild !== 'function') return null;
  ensureBm1DashboardStyles();
  const surface = createBm1UiHudSurface();
  const panel = document.createElement('section');
  panel.className = BM1_DASHBOARD_PANEL_CLASS;
  panel.dataset.version = BM1_DASHBOARD_PANEL_VERSION;
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

  const onClick = (event) => {
    const button = event.target?.closest?.('[data-bm1-action]');
    if (!button) return;
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

  panel.addEventListener('click', onClick);

  return {
    panel,
    surface,
    destroy() {
      panel.removeEventListener('click', onClick);
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
    <div class="panel-section">
      <div class="panel-section-title">${escapeHtml(surface.title)}</div>
      <div class="panel-value">${escapeHtml(surface.version)} · ${escapeHtml(surface.mode)}</div>
    </div>
    ${surface.cards.map(renderCard).join('')}
    <div class="panel-section">
      <div class="panel-section-title">BM1 Result</div>
      <pre class="panel-value" data-bm1-output>Ready</pre>
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
