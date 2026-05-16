import { executeMacro, executeMacroScriptReport } from './macro-engine.js';
import { formatMacroScriptSummary } from './macro-script-report.js';
import {
  buildMacroScriptExample,
  createMacroScriptDownloadPayload,
  normalizeMacroScriptText,
} from './macro-script-io.js';
import {
  buildDefaultMacroScriptLibrary,
  createMacroScriptLibraryDownloadPayload,
  findMacroScriptLibraryEntry,
  importMacroScriptLibraryJson,
  loadMacroScriptLibraryFromStorage,
  removeMacroScriptLibraryEntry,
  saveMacroScriptLibraryToStorage,
  sortMacroScriptLibrary,
  upsertMacroScriptLibraryEntry,
  validateMacroScriptLibraryImportJson,
} from './macro-script-library.js';
import { emit } from '../core/event-bus.js';
import { pushHistory, undoLast, historyCount } from './macro-history.js';

function removeByIds(components, ids) {
  const set = new Set(ids || []);
  return (components || []).filter(comp => !set.has(comp.id));
}

function downloadText(name, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
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
      <button id="macro-script-toggle" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">Script</button>
      <button id="macro-run-script" style="border:1px solid #3a4255;background:#1f3b2d;color:#bbf7d0;border-radius:4px;cursor:pointer;">Run</button>
      <button id="macro-toggle" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">▼</button>
    </div>
    <div id="macro-output" style="max-height:140px;overflow:auto;padding:8px 10px;"></div>
    <div id="macro-script-panel" style="display:none;border-top:1px solid rgba(58,66,85,.5);padding:8px 10px;background:rgba(15,23,42,.75);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-weight:600;color:#93c5fd;">SCRIPT</span>
        <label style="display:flex;align-items:center;gap:4px;color:#cbd5e1;font-size:11px;">
          <input id="macro-script-stop-on-error" type="checkbox" checked>
          Stop on error
        </label>
        <button id="macro-script-example" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">Example</button>
        <button id="macro-script-clear" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">Clear</button>
        <button id="macro-script-export" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">Export Report</button>
        <input id="macro-script-library-name" placeholder="Script name" style="min-width:160px;background:#070b14;border:1px solid #3a4255;border-radius:4px;color:#e8eaf0;font-family:monospace;font-size:11px;padding:4px 6px;">
        <select id="macro-script-library-select" style="max-width:220px;background:#070b14;border:1px solid #3a4255;border-radius:4px;color:#e8eaf0;font-family:monospace;font-size:11px;padding:4px 6px;"></select>
        <button id="macro-script-library-save" style="border:1px solid #3a4255;background:#17324a;color:#bfdbfe;border-radius:4px;cursor:pointer;">Save Script</button>
        <button id="macro-script-library-load" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">Load</button>
        <button id="macro-script-library-delete" style="border:1px solid #3a4255;background:#3a1f1f;color:#fecaca;border-radius:4px;cursor:pointer;">Delete</button>
        <button id="macro-script-library-export" style="border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;">Export Library</button>
        <select id="macro-script-library-import-mode" style="max-width:110px;background:#070b14;border:1px solid #3a4255;border-radius:4px;color:#e8eaf0;font-family:monospace;font-size:11px;padding:4px 6px;">
          <option value="merge">Merge</option>
          <option value="replace">Replace</option>
        </select>
        <button id="macro-script-library-import" style="border:1px solid #3a4255;background:#2e2a1f;color:#fde68a;border-radius:4px;cursor:pointer;">Import Library</button>
        <input id="macro-script-library-file" type="file" accept="application/json,.json" style="display:none;">
      </div>
      <textarea id="macro-script-textarea" spellcheck="false" placeholder="LINE START=0,0,0 X1000&#10;ROUTES&#10;USE_ROUTE R-1" style="width:100%;min-height:120px;resize:vertical;background:#070b14;border:1px solid #3a4255;border-radius:6px;color:#e8eaf0;font-family:monospace;font-size:12px;padding:8px;box-sizing:border-box;"></textarea>
    </div>
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
  const scriptToggle = host.querySelector('#macro-script-toggle');
  const runScriptBtn = host.querySelector('#macro-run-script');
  const scriptPanel = host.querySelector('#macro-script-panel');
  const scriptTextarea = host.querySelector('#macro-script-textarea');
  const scriptStopOnError = host.querySelector('#macro-script-stop-on-error');
  const scriptExample = host.querySelector('#macro-script-example');
  const scriptClear = host.querySelector('#macro-script-clear');
  const scriptExport = host.querySelector('#macro-script-export');
  const scriptLibraryName = host.querySelector('#macro-script-library-name');
  const scriptLibrarySelect = host.querySelector('#macro-script-library-select');
  const scriptLibrarySave = host.querySelector('#macro-script-library-save');
  const scriptLibraryLoad = host.querySelector('#macro-script-library-load');
  const scriptLibraryDelete = host.querySelector('#macro-script-library-delete');
  const scriptLibraryExport = host.querySelector('#macro-script-library-export');
  const scriptLibraryImportMode = host.querySelector('#macro-script-library-import-mode');
  const scriptLibraryImport = host.querySelector('#macro-script-library-import');
  const scriptLibraryFile = host.querySelector('#macro-script-library-file');

  const inputHistory = [];
  let hIdx = -1;
  let lastScriptReport = null;

  const macroScriptStorage = typeof window !== 'undefined' ? window.localStorage : null;
  let scriptLibrary = loadMacroScriptLibraryFromStorage(macroScriptStorage);

  if (!scriptLibrary.length) {
    scriptLibrary = buildDefaultMacroScriptLibrary();
  }

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
      'Commands: USE_ROUTE, CURRENT_ROUTE, CLEAR_ROUTE, ROUTES, ROUTE_INFO, ROUTE_DERIVED, LINE, POLYLINE, SPLINE/SPLINE_GUIDE, PIPE, ELBOW, TEE, FLANGE, VALVE, REDUCER, SUPPORT, LABEL, CIRCLE',
      '  CIRCLE cx,cy,cz RADIUS=500  |  CIRCLE cx,cy,cz rx,ry,rz (radius point)',
      'Construction: ORIGIN, ALIGN, ARRAY LAST n dx,dy,dz, MIRROR LAST PLANE=XY/XZ/YZ',
      'Route mode: ROUTE ... / START / RUN / ELBOW 90 DIR / TEE BRANCH-OD=.. BRANCH=.. / END',
      'Draft parity: LINE, POLYLINE, SPLINE/SPLINE_GUIDE',
      'Draft tokens: START=x,y,z X1000 Y-750 R500 D250 @dx,dy,dz @length<angle',
      'Route inspect: ROUTES / ROUTE_INFO ROUTE=<id> / ROUTE_DERIVED ROUTE=<id>',
      'Route session: USE_ROUTE <id> / CURRENT_ROUTE / CLEAR_ROUTE',
      'Script runner: terminal.runScript(script, { stopOnError:true|false })',
      'Queries: LIST [TYPE], DIST p1 p2, INSPECT id, VALIDATE',
      'Keys: ↑↓ history, Ctrl+Z undo, Ctrl+L clear, F1 help',
    ];
    lines.forEach(line => log(line, '#60a5fa'));
  }

  function setScript(script = '') {
    scriptTextarea.value = normalizeMacroScriptText(script);
    return scriptTextarea.value;
  }

  function getScript() {
    return normalizeMacroScriptText(scriptTextarea.value || '');
  }

  function toggleScriptPanel(force = null) {
    const nextVisible = force == null
      ? scriptPanel.style.display === 'none'
      : Boolean(force);

    scriptPanel.style.display = nextVisible ? 'block' : 'none';
    return nextVisible;
  }

  function exportLastReport() {
    if (!lastScriptReport) {
      log('• No macro script report available to export', '#94a3b8');
      return null;
    }

    const payload = createMacroScriptDownloadPayload(lastScriptReport);
    downloadText(payload.filename, payload.text, payload.mime);
    log(`✓ Exported ${payload.filename}`, '#4ade80');
    return payload;
  }

  scriptToggle.addEventListener('click', () => {
    toggleScriptPanel();
  });

  runScriptBtn.addEventListener('click', () => {
    runScript(getScript(), {
      stopOnError: Boolean(scriptStopOnError.checked),
      sourceName: 'macro-terminal-panel',
    });
  });

  scriptExample.addEventListener('click', () => {
    setScript(buildMacroScriptExample());
    toggleScriptPanel(true);
  });

  scriptClear.addEventListener('click', () => {
    setScript('');
  });

  function refreshScriptLibrarySelect(selectedId = null) {
    scriptLibrary = sortMacroScriptLibrary(scriptLibrary);
    scriptLibrarySelect.innerHTML = '';

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = scriptLibrary.length ? 'Select saved script…' : 'No saved scripts';
    scriptLibrarySelect.appendChild(empty);

    for (const entry of scriptLibrary) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      scriptLibrarySelect.appendChild(option);
    }

    if (selectedId) {
      scriptLibrarySelect.value = selectedId;
    }

    return scriptLibrary;
  }

  function persistScriptLibrary(selectedId = null) {
    scriptLibrary = saveMacroScriptLibraryToStorage(macroScriptStorage, scriptLibrary);
    refreshScriptLibrarySelect(selectedId);
    return scriptLibrary;
  }

  function getScriptLibrary() {
    return sortMacroScriptLibrary(scriptLibrary);
  }

  function saveCurrentScriptToLibrary(name = '') {
    const selected = scriptLibrarySelect.value || '';
    const existing = selected ? findMacroScriptLibraryEntry(scriptLibrary, selected) : null;
    const finalName = name || scriptLibraryName.value || existing?.name || 'Untitled Macro Script';

    const result = upsertMacroScriptLibraryEntry(scriptLibrary, {
      id: existing?.id || null,
      name: finalName,
      script: getScript(),
    });

    scriptLibrary = result.entries;
    scriptLibraryName.value = result.entry.name;
    persistScriptLibrary(result.entry.id);

    log(`✓ Saved script: ${result.entry.name}`, '#4ade80');
    return result.entry;
  }

  function loadScriptFromLibrary(id = '') {
    const scriptId = id || scriptLibrarySelect.value;
    const entry = findMacroScriptLibraryEntry(scriptLibrary, scriptId);

    if (!entry) {
      log('• Select a saved macro script to load', '#94a3b8');
      return null;
    }

    setScript(entry.script);
    scriptLibraryName.value = entry.name;
    scriptLibrarySelect.value = entry.id;
    toggleScriptPanel(true);

    log(`✓ Loaded script: ${entry.name}`, '#4ade80');
    return entry;
  }

  function deleteScriptFromLibrary(id = '') {
    const scriptId = id || scriptLibrarySelect.value;
    const result = removeMacroScriptLibraryEntry(scriptLibrary, scriptId);

    if (!result.removed) {
      log('• Select a saved macro script to delete', '#94a3b8');
      return null;
    }

    scriptLibrary = result.entries;
    persistScriptLibrary();

    if (scriptLibraryName.value === result.removed.name) {
      scriptLibraryName.value = '';
    }

    log(`✓ Deleted script: ${result.removed.name}`, '#fbbf24');
    return result.removed;
  }

  function exportScriptLibrary() {
    const payload = createMacroScriptLibraryDownloadPayload(scriptLibrary);
    downloadText(payload.filename, payload.text, payload.mime);
    log(`✓ Exported ${payload.filename}`, '#4ade80');
    return payload;
  }

  function importScriptLibraryFromJson(jsonText = '', options = {}) {
    const mode = options.mode === 'replace' ? 'replace' : 'merge';
    const validation = validateMacroScriptLibraryImportJson(jsonText);

    const result = importMacroScriptLibraryJson(scriptLibrary, jsonText, {
      mode,
      now: options.now || null,
    });

    scriptLibrary = result.entries;
    persistScriptLibrary();

    log(
      `✓ Imported ${validation.count} script(s) into library (${mode}; total=${scriptLibrary.length})`,
      '#4ade80'
    );

    return {
      ...result,
      validation,
    };
  }

  async function importScriptLibraryFromFile(file, options = {}) {
    const text = await readTextFile(file);
    return importScriptLibraryFromJson(text, options);
  }

  scriptExport.addEventListener('click', () => {
    exportLastReport();
  });

  scriptLibrarySave.addEventListener('click', () => {
    saveCurrentScriptToLibrary();
  });

  scriptLibraryLoad.addEventListener('click', () => {
    loadScriptFromLibrary();
  });

  scriptLibraryDelete.addEventListener('click', () => {
    deleteScriptFromLibrary();
  });

  scriptLibraryExport.addEventListener('click', () => {
    exportScriptLibrary();
  });

  scriptLibraryImport.addEventListener('click', () => {
    scriptLibraryFile.value = '';
    scriptLibraryFile.click();
  });

  scriptLibraryFile.addEventListener('change', async () => {
    const file = scriptLibraryFile.files?.[0];

    if (!file) return;

    try {
      await importScriptLibraryFromFile(file, {
        mode: scriptLibraryImportMode.value || 'merge',
      });
    } catch (err) {
      log(`✗ Import failed: ${err.message}`, '#ef4444');
      setStatus('error', err.message);
    }
  });

  scriptLibrarySelect.addEventListener('change', () => {
    const entry = findMacroScriptLibraryEntry(scriptLibrary, scriptLibrarySelect.value);
    if (entry) {
      scriptLibraryName.value = entry.name;
    }
  });

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

  function runScript(script, options = {}) {
    const report = executeMacroScriptReport(script, ctx, {
      stopOnError: options.stopOnError !== false,
      throwOnError: false,
      sourceName: options.sourceName || 'macro-terminal-script',
    });
    lastScriptReport = report;

    for (const entry of report.results) {
      log(`> [${entry.line}] ${entry.command}`, '#94a3b8');

      if (entry.ok) {
        applyResult(entry.result, entry.command);
      } else {
        log(`✗ [${entry.line}] ${entry.error?.message || 'Macro script line failed'}`, '#ef4444');
      }
    }

    const summary = formatMacroScriptSummary(report);
    log(summary, report.ok ? '#4ade80' : '#ef4444');
    setStatus(report.ok ? 'idle' : 'error', summary);

    emit('debug:trace', {
      scope: 'macro-terminal',
      event: 'SCRIPT_RESULT',
      ok: report.ok,
      timestamp: Date.now(),
      details: {
        summary: report.summary,
        sourceName: report.sourceName,
      },
    });

    updateBadges();
    return report;
  }

  refreshScriptLibrarySelect();
  printHelp();
  updateBadges();
  return {
    host,
    ctx,
    runScript,
    setScript,
    getScript,
    toggleScriptPanel,
    exportLastReport,
    getLastScriptReport: () => lastScriptReport,
    getScriptLibrary,
    saveCurrentScriptToLibrary,
    loadScriptFromLibrary,
    deleteScriptFromLibrary,
    exportScriptLibrary,
    importScriptLibraryFromJson,
    importScriptLibraryFromFile,
    refreshScriptLibrarySelect,
  };
}
