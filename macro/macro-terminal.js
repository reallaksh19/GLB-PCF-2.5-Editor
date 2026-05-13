import { executeMacro } from './macro-engine.js';
import { emit } from '../core/event-bus.js';
import { pushHistory, undoLast, historyCount } from './macro-history.js';

function removeByIds(components, ids) {
  const set = new Set(ids || []);
  return (components || []).filter(comp => !set.has(comp.id));
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function initMacroTerminal(options) {
  const {
    container = document.getElementById('hifi-viewer-canvas'),
    renderer = null,
    getComponents,
    setComponents,
    getDomain,
    getRouteEngine = null,
    setStatus = () => {},
    addComponent = null,
    addComponents = null,
    refreshModel = null,
  } = options || {};

  if (!container || !renderer || typeof getComponents !== 'function' || typeof setComponents !== 'function' || typeof getDomain !== 'function') {
    console.error('initMacroTerminal requires container, renderer, getComponents, setComponents, getDomain');
    return null;
  }

  const host = document.createElement('div');
  host.id = 'macro-terminal';
  host.innerHTML = `
    <div id="macro-header" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #3a4255;">
      <span style="font-weight:600;color:#f59e0b;">⌨ MACRO TERMINAL</span>
      <span id="macro-route-badge" style="font-size:11px;color:#94a3b8;opacity:.85">idle</span>
      <span style="margin-left:auto;font-size:11px;color:#94a3b8;">History: <span id="macro-history-count">0</span> cmds</span>
      <button id="macro-toggle" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">▼</button>
    </div>
    <div id="macro-output" style="max-height:140px;overflow:auto;padding:8px 10px;"></div>
    <div id="macro-input-row" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid rgba(58,66,85,.5);">
      <span style="color:#f59e0b">›</span>
      <input id="macro-input" autocomplete="off" spellcheck="false" placeholder="PIPE 0,0,0 3000,0,0 OD=168.3" style="flex:1;background:transparent;border:none;outline:none;color:#e8eaf0;font-family:monospace;font-size:12px;">
    </div>`;
  const isHiFiTray = container.id === 'hifi-macro-tray';
  Object.assign(host.style, {
    position: isHiFiTray ? 'relative' : 'absolute',
    left: isHiFiTray ? 'auto' : '0',
    right: isHiFiTray ? 'auto' : '0',
    bottom: isHiFiTray ? 'auto' : '0',
    top: 'auto',
    inset: isHiFiTray ? 'auto' : 'auto 0 0 0',
    width: '100%',
    height: 'auto',
    background: 'rgba(10,14,26,0.97)',
    borderTop: isHiFiTray ? 'none' : '1px solid #3a4255',
    color: '#e8eaf0',
    fontFamily: 'monospace',
    fontSize: '12px',
    zIndex: '120',
    boxShadow: isHiFiTray ? 'none' : '0 -10px 24px rgba(0,0,0,.25)',
  });
  container.style.position ||= 'relative';
  container.appendChild(host);

  const input = host.querySelector('#macro-input');
  const output = host.querySelector('#macro-output');
  const toggle = host.querySelector('#macro-toggle');
  const badge = host.querySelector('#macro-route-badge');
  const countEl = host.querySelector('#macro-history-count');

  const inputHistory = [];
  let hIdx = -1;

  const ctx = {
    defaultOD: 168.3,
    defaultMat: 'CS',
    pipeline: '',
    workingOrigin: { x: 0, y: 0, z: 0 },
    workingAlignment: 'NORTH',
    lastPoint: null,
    lastEntities: [],
    routeState: null,
    getComponents,
    getDomain,
    getRouteEngine,
  };

  function updateBadges() {
    badge.textContent = ctx.routeState?.active ? `route: ${ctx.pipeline || 'active'}` : 'idle';
    badge.style.color = ctx.routeState?.active ? '#4ade80' : '#94a3b8';
    countEl.textContent = String(historyCount());
  }

  function log(msg, color = '#94a3b8') {
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.color = color;
    div.style.padding = '1px 0';
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  function applyResult(result, line) {
    if (!result) return;
    if (Array.isArray(result.lines)) result.lines.forEach(line => log(line, '#cbd5e1'));
    if (result.message) log(`✓ ${result.message}`, '#4ade80');

    const newComps = result.comps || (result.comp ? [result.comp] : []);
    if (newComps.length) {
      if (typeof addComponents === 'function') {
        addComponents(newComps);
      } else {
        const merged = [...getComponents(), ...newComps];
        setComponents(merged);
        if (typeof refreshModel === 'function') refreshModel();
        else {
          renderer.addComponents ? renderer.addComponents(newComps, getDomain()) : renderer.loadComponents(merged, getDomain());
          emit('model-loaded', { components: merged, domain: getDomain(), source: 'macro-terminal', sourceName: 'macro-terminal', loadedAt: Date.now() });
        }
      }
      emit('debug:trace', {
        scope: 'macro-terminal',
        event: 'COMMAND_EXECUTED',
        ok: true,
        timestamp: Date.now(),
        details: { line, createdCount: newComps.length },
      });
      pushHistory({
        label: line,
        createdIds: newComps.map(comp => comp.id),
        undoMessage: `Undo: removed ${newComps.length} component(s)`,
        undo() {
          const next = removeByIds(getComponents(), newComps.map(comp => comp.id));
          setComponents(next);
          renderer.loadComponents(next, getDomain());
          emit('model-loaded', { components: next, domain: getDomain(), source: 'macro-undo', sourceName: 'macro-undo', loadedAt: Date.now() });
          emit('debug:trace', { scope: 'macro-terminal', event: 'UNDO', ok: true, timestamp: Date.now(), details: { removedCount: newComps.length } });
        },
      });
    }
    updateBadges();
  }

  function printHelp() {
    const lines = [
      'Commands: ROUTES, ROUTE_INFO, ROUTE_DERIVED, LINE, POLYLINE, SPLINE/SPLINE_GUIDE, PIPE, ELBOW, TEE, FLANGE, VALVE, REDUCER, SUPPORT, LABEL, CIRCLE',
      '  CIRCLE cx,cy,cz RADIUS=500  |  CIRCLE cx,cy,cz rx,ry,rz (radius point)',
      'Construction: ORIGIN, ALIGN, ARRAY LAST n dx,dy,dz, MIRROR LAST PLANE=XY/XZ/YZ',
      'Route mode: ROUTE ... / START / RUN / ELBOW 90 DIR / TEE BRANCH-OD=.. BRANCH=.. / END',
      'Draft parity: LINE, POLYLINE, SPLINE/SPLINE_GUIDE',
      'Draft tokens: START=x,y,z X1000 Y-750 R500 D250 @dx,dy,dz @length<angle',
      'Route inspect: ROUTES / ROUTE_INFO ROUTE=<id> / ROUTE_DERIVED ROUTE=<id>',
      'Queries: LIST [TYPE], DIST p1 p2, INSPECT id, VALIDATE',
      'Keys: ↑↓ history, Ctrl+Z undo, Ctrl+L clear, F1 help',
    ];
    lines.forEach(line => log(line, '#60a5fa'));
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const line = input.value.trim();
      if (!line) return;
      inputHistory.unshift(line);
      hIdx = -1;
      input.value = '';
      setStatus('active', 'Executing macro command…');
      log(`> ${line}`, '#94a3b8');
      try {
        const result = executeMacro(line, ctx);
        applyResult(result, line);
        setStatus('idle', result?.message || 'Macro command executed');
        if (!result?.comp && !result?.comps?.length) {
          emit('debug:trace', { scope: 'macro-terminal', event: 'COMMAND_RESULT', ok: true, timestamp: Date.now(), details: { line, message: result?.message || '' } });
        }
      } catch (err) {
        log(`✗ ${err.message}`, '#ef4444');
        setStatus('error', err.message);
        emit('debug:trace', { scope: 'macro-terminal', event: 'COMMAND_ERROR', ok: false, timestamp: Date.now(), details: { line, message: err.message } });
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      hIdx = Math.min(hIdx + 1, inputHistory.length - 1);
      input.value = inputHistory[hIdx] || '';
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      hIdx = Math.max(hIdx - 1, -1);
      input.value = hIdx >= 0 ? inputHistory[hIdx] : '';
      return;
    }

    if (e.key === 'F1') {
      e.preventDefault();
      printHelp();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      output.innerHTML = '';
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const res = undoLast({ getComponents, setComponents, getDomain, renderer });
      if (res.ok) {
        log(`↶ ${res.message}`, '#fbbf24');
        setStatus('idle', res.message);
      } else {
        log(`• ${res.message}`, '#94a3b8');
      }
      updateBadges();
    }
  });

  toggle.addEventListener('click', () => {
    const collapsed = output.style.display === 'none';
    output.style.display = collapsed ? 'block' : 'none';
    host.querySelector('#macro-input-row').style.display = collapsed ? 'flex' : 'none';
    toggle.textContent = collapsed ? '▼' : '▲';
  });

  // small command export for debug / future save-macro
  host.addEventListener('macro:dump', () => {
    downloadText('macro-terminal-history.txt', inputHistory.slice().reverse().join('\n'));
  });

  printHelp();
  updateBadges();
  return { host, ctx };
}
