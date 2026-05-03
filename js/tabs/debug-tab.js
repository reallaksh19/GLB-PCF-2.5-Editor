import { on, emit } from '../../core/event-bus.js';
import { appLogger } from '../debug/logger.js';
import { capabilities } from '../capabilities/capability-registry.js';
import { DEBUG_UI_IDS, DEBUG_SECTION_ATTR, byId, queryAll } from '../ui/viewer-ui-contract.js';

const debugState = {
  components: [],
  domain: null,
  selectedId: null,
  sourceName: '',
  loadedAt: 0,
  traces: [],
  activeSection: 'summary',
  hudState: null,
  masterDb: null,
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

function componentRows(components) {
  return (components || []).map((comp) => ({
    id: comp.id,
    type: comp.type,
    origin: comp.geometry?.origin
      ? `${comp.geometry.origin.x}, ${comp.geometry.origin.y}, ${comp.geometry.origin.z}`
      : '—',
    bore: comp.geometry?.bore ?? comp.attributes?.BORE ?? '—',
    pipelineRef: comp.attributes?.['PIPELINE-REFERENCE'] || '—',
    attrCount: Object.keys(comp.attributes || {}).length,
  }));
}

function countsByType(components) {
  const map = new Map();
  for (const comp of components || []) {
    map.set(comp.type || 'UNKNOWN', (map.get(comp.type || 'UNKNOWN') || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function getValidation() {
  return debugState.domain?.validate?.(debugState.components) || [];
}

function getLogs() {
  return appLogger.dump();
}

function getHudState() {
  return globalThis.window?.__viewerShell?.getHudState?.() || debugState.hudState || null;
}

function getMasterDbState() {
  return globalThis.window?.__viewerShell?.getMasterDbState?.() || debugState.masterDb || null;
}

function getDebugSnapshot() {
  return {
    meta: {
      domain: debugState.domain?.name || null,
      sourceName: debugState.sourceName || null,
      loadedAt: debugState.loadedAt || null,
      selectedId: debugState.selectedId || null,
      activeSection: debugState.activeSection,
      hudMode: getHudState()?.mode || null,
      hudVisible: getHudState()?.visible ?? null,
      masterDbRows: getMasterDbState()?.rows?.length || 0,
      masterDbOpen: getMasterDbState()?.open ?? null,
    },
    hud: getHudState(),
    masterDb: getMasterDbState(),
    components: debugState.components,
    validation: getValidation(),
    logs: getLogs(),
    traces: debugState.traces,
  };
}

function downloadTextFile(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function renderSummary(container) {
  const validations = getValidation();
  const typeRows = countsByType(debugState.components)
    .map(([type, count]) => `<tr><td>${esc(type)}</td><td>${count}</td></tr>`)
    .join('');

  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Model Summary</div>
      <table class="panel-table">
        <tr><td class="panel-label">Domain</td><td class="panel-value">${esc(debugState.domain?.label || debugState.domain?.name || '—')}</td></tr>
        <tr><td class="panel-label">Components</td><td class="panel-value">${debugState.components.length}</td></tr>
        <tr><td class="panel-label">Selected</td><td class="panel-value">${esc(debugState.selectedId || '—')}</td></tr>
        <tr><td class="panel-label">Source</td><td class="panel-value">${esc(debugState.sourceName || '—')}</td></tr>
        <tr><td class="panel-label">Loaded At</td><td class="panel-value">${esc(formatTs(debugState.loadedAt))}</td></tr>
        <tr><td class="panel-label">Logs</td><td class="panel-value">${getLogs().length}</td></tr>
        <tr><td class="panel-label">Errors / Warn / Info</td><td class="panel-value">${appLogger.count('ERROR')} / ${appLogger.count('WARN')} / ${appLogger.count('INFO')}</td></tr>
        <tr><td class="panel-label">Validation</td><td class="panel-value">${validations.length}</td></tr>
        <tr><td class="panel-label">Traces</td><td class="panel-value">${debugState.traces.length}</td></tr>
        <tr><td class="panel-label">HUD</td><td class="panel-value">${esc(getHudState()?.mode || 'idle')} / ${getHudState()?.visible === false ? 'hidden' : 'visible'}</td></tr>
        <tr><td class="panel-label">Master DB</td><td class="panel-value">${(getMasterDbState()?.rows || []).length} rows / ${getMasterDbState()?.open ? 'open' : 'closed'}</td></tr>
        <tr><td class="panel-label">Resolver</td><td class="panel-value">${esc(getMasterDbState()?.lastResolution?.matchKey || '—')} (${esc(getMasterDbState()?.lastResolution?.source || '—')})</td></tr>
      </table>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Counts by Type</div>
      <table class="panel-table">
        <thead><tr><td class="panel-label">Type</td><td class="panel-value">Count</td></tr></thead>
        <tbody>${typeRows || '<tr><td colspan="2" class="panel-value">No components loaded</td></tr>'}</tbody>
      </table>
    </div>`;
}

function renderLog(container) {
  const logs = getLogs();
  const traces = debugState.traces;
  const logHtml = logs.map((entry) => {
    const cls = `log-${entry.level}`;
    return `<div class="${cls}">[${esc(formatTs(entry.timestamp))}] ${esc(entry.level)} ${esc(entry.code)} ${esc(JSON.stringify(entry.data || {}))}</div>`;
  }).join('');
  const traceHtml = traces.map((entry) => {
    return `<div class="log-INFO">[${esc(formatTs(entry.timestamp || Date.now()))}] TRACE ${esc(entry.scope || 'app')} ${esc(entry.event || '')} ${esc(JSON.stringify(entry.details || entry))}</div>`;
  }).join('');
  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Parse / Runtime Log</div>
      ${logHtml || '<div>No log entries</div>'}
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Debug Trace</div>
      ${traceHtml || '<div>No debug traces</div>'}
    </div>`;
}

function renderComponents(container) {
  const rows = componentRows(debugState.components);
  container.innerHTML = `
    <input id="debug-search" class="debug-search" placeholder="Search id, type, origin, pipeline...">
    <div id="debug-components-table-wrap"></div>`;
  const input = container.querySelector('#debug-search');
  const wrap = container.querySelector('#debug-components-table-wrap');

  const draw = () => {
    const q = String(input.value || '').trim().toLowerCase();
    const filtered = !q ? rows : rows.filter((row) =>
      [row.id, row.type, row.origin, row.pipelineRef].some((v) => String(v).toLowerCase().includes(q))
    );

    wrap.innerHTML = `
      <table class="panel-table">
        <thead>
          <tr>
            <td class="panel-label">ID</td>
            <td class="panel-label">Type</td>
            <td class="panel-label">Origin</td>
            <td class="panel-label">Bore</td>
            <td class="panel-label">Pipeline</td>
            <td class="panel-label">Attrs</td>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((row) => `<tr class="${row.id === debugState.selectedId ? 'row-highlight' : ''}"><td class="panel-value">${esc(row.id)}</td><td class="panel-value">${esc(row.type)}</td><td class="panel-value">${esc(row.origin)}</td><td class="panel-value">${esc(row.bore)}</td><td class="panel-value">${esc(row.pipelineRef)}</td><td class="panel-value">${row.attrCount}</td></tr>`).join('') || '<tr><td colspan="6" class="panel-value">No components found</td></tr>'}
        </tbody>
      </table>`;
  };

  input.addEventListener('input', draw);
  draw();
}

function renderValidation(container) {
  const validations = getValidation();
  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Validation</div>
      ${validations.map((v) => `<div class="val-${esc(v.severity || 'info')}">[${esc(v.severity || 'info').toUpperCase()}] ${esc(v.code || '')} ${esc(v.compId || '')} — ${esc(v.message || '')}</div>`).join('') || '<div>No validation issues</div>'}
    </div>`;
}

function renderActiveSection() {
  const container = byId(DEBUG_UI_IDS.content);
  if (!container) return;
  if (debugState.activeSection === 'summary') return renderSummary(container);
  if (debugState.activeSection === 'log') return renderLog(container);
  if (debugState.activeSection === 'components') return renderComponents(container);
  return renderValidation(container);
}

function syncSectionButtons() {
  queryAll(`[${DEBUG_SECTION_ATTR}]`).forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute(DEBUG_SECTION_ATTR) === debugState.activeSection);
  });
}

export function initDebugTab() {
  const domainLabel = byId(DEBUG_UI_IDS.domainLabel);
  const refreshBtn = byId(DEBUG_UI_IDS.refresh);
  const copyBtn = byId(DEBUG_UI_IDS.copyJson);
  const exportBtn = byId(DEBUG_UI_IDS.exportLog);

  queryAll(`[${DEBUG_SECTION_ATTR}]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      debugState.activeSection = btn.getAttribute(DEBUG_SECTION_ATTR) || 'summary';
      syncSectionButtons();
      renderActiveSection();
    });
  });

  refreshBtn?.addEventListener('click', () => {
    emit('debug:trace', { scope: 'debug-tab', event: 'REFRESH', ok: true, timestamp: Date.now() });
    renderActiveSection();
  });
  copyBtn?.addEventListener('click', async () => {
    try {
      await copyText(JSON.stringify(getDebugSnapshot(), null, 2));
      emit('debug:trace', { scope: 'debug-tab', event: 'COPY_JSON', ok: true, timestamp: Date.now() });
    } catch (err) {
      appLogger.error('DEBUG_COPY_JSON_FAIL', { message: String(err?.message || err) });
    }
  });
  exportBtn?.addEventListener('click', () => {
    const snapshot = getDebugSnapshot();
    const logText = [
      '=== LOGS ===',
      ...snapshot.logs.map((entry) => `${new Date(entry.timestamp).toISOString()} [${entry.level}] ${entry.code} ${JSON.stringify(entry.data || {})}`),
      '',
      '=== TRACES ===',
      ...snapshot.traces.map((entry) => `${new Date(entry.timestamp || Date.now()).toISOString()} TRACE ${entry.scope || 'app'} ${entry.event || ''} ${JSON.stringify(entry.details || entry)}`),
    ].join('\n');
    downloadTextFile('debug-log.txt', logText || '');
    emit('debug:trace', { scope: 'debug-tab', event: 'EXPORT_LOG', ok: true, timestamp: Date.now() });
  });

  on('model-loaded', ({ components, domain, sourceName, loadedAt, source, hudState, masterDb }) => {
    debugState.components = Array.isArray(components) ? components : [];
    debugState.domain = domain || null;
    debugState.sourceName = sourceName || source || '';
    debugState.loadedAt = loadedAt || Date.now();
    debugState.hudState = hudState || getHudState();
    debugState.masterDb = masterDb || getMasterDbState();
    if (domainLabel) domainLabel.textContent = `domain: ${domain?.label || domain?.name || '—'}`;
    renderActiveSection();
  });

  on('component-selected', ({ id }) => {
    debugState.selectedId = id || null;
    if (debugState.activeSection === 'summary' || debugState.activeSection === 'components') {
      renderActiveSection();
    }
  });

  on('debug:trace', (entry) => {
    debugState.traces.push(entry);
    if (debugState.traces.length > 200) debugState.traces.shift();
    if (debugState.activeSection === 'log' || debugState.activeSection === 'summary') {
      renderActiveSection();
    }
  });

  appLogger.subscribe(() => {
    if (debugState.activeSection === 'log' || debugState.activeSection === 'summary' || debugState.activeSection === 'validation') {
      renderActiveSection();
    }
  });

  syncSectionButtons();
  renderActiveSection();

  if (typeof window !== 'undefined') {
    window.__debugTabState = debugState;
    window.__debugSnapshot = getDebugSnapshot;
  }

  capabilities.ready('debug-tab');
}
