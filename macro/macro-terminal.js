import { executeMacro, executeMacroScriptReport, lintMacroScript } from './macro-engine.js';
import { formatMacroScriptSummary } from './macro-script-report.js';
import { formatMacroScriptLintSummary } from './macro-script-lint.js';
import { createMacroScriptRunBlockedReport, formatMacroScriptRunBlockedSummary, normalizeMacroScriptRunOptions, shouldRunMacroScriptAfterLint } from './macro-script-run-policy.js';
import { createMacroReportDownloadPayload } from './macro-report-io.js';
import { buildMacroScriptExample, createMacroScriptDownloadPayload, normalizeMacroScriptText } from './macro-script-io.js';
import {
  buildDefaultMacroScriptLibrary, createMacroScriptLibraryDownloadPayload, filterMacroScriptLibrary, findMacroScriptLibraryEntry,
  formatMacroScriptLibraryOptionLabel, formatMacroScriptTags, importMacroScriptLibraryJson, loadMacroScriptLibraryFromStorage,
  parseMacroScriptTags, removeMacroScriptLibraryEntry, saveMacroScriptLibraryToStorage, sortMacroScriptLibrary,
  updateMacroScriptLibraryEntryMetadata, upsertMacroScriptLibraryEntry, validateMacroScriptLibraryImportJson,
} from './macro-script-library.js';
import { emit } from '../core/event-bus.js';
import { pushHistory, undoLast, historyCount } from './macro-history.js';
import { createMacroTerminalHost } from './macro-terminal-ui.js';

const HELP_LINES = [
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
const removeByIds = (components, ids) => {
  const set = new Set(ids || []);
  return (components || []).filter((comp) => !set.has(comp.id));
};
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
    if (!file) { reject(new Error('No file selected')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function initMacroTerminal(options) {
  const {
    container = document.getElementById('hifi-viewer-canvas'), renderer = null, getComponents, setComponents, getDomain,
    getRouteEngine = null, setStatus = () => {}, addComponents = null, refreshModel = null,
  } = options || {};
  if (!container || !renderer || typeof getComponents !== 'function' || typeof setComponents !== 'function' || typeof getDomain !== 'function') {
    console.error('initMacroTerminal requires container, renderer, getComponents, setComponents, getDomain');
    return null;
  }

  const { host, elements: el } = createMacroTerminalHost(container);
  const inputHistory = [];
  let hIdx = -1;
  let lastScriptReport = null;
  let lastScriptLintReport = null;
  let lastScriptRunBlockedReport = null;
  const macroScriptStorage = typeof window !== 'undefined' ? window.localStorage : null;
  let scriptLibrary = loadMacroScriptLibraryFromStorage(macroScriptStorage);
  let scriptLibraryFilterQuery = '';
  if (!scriptLibrary.length) scriptLibrary = buildDefaultMacroScriptLibrary();

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
  const updateBadges = () => {
    el.badge.textContent = ctx.routeState?.active ? `route: ${ctx.pipeline || 'active'}` : 'idle';
    el.badge.style.color = ctx.routeState?.active ? '#4ade80' : '#94a3b8';
    el.countEl.textContent = String(historyCount());
  };
  const log = (msg, color = '#94a3b8') => {
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.color = color;
    div.style.padding = '1px 0';
    el.output.appendChild(div);
    el.output.scrollTop = el.output.scrollHeight;
  };

  function applyResult(result, line) {
    if (!result) return;
    if (Array.isArray(result.lines)) result.lines.forEach((item) => log(item, '#cbd5e1'));
    if (result.message) log(`✓ ${result.message}`, '#4ade80');
    const newComps = result.comps || (result.comp ? [result.comp] : []);
    if (newComps.length) {
      if (typeof addComponents === 'function') addComponents(newComps);
      else {
        const merged = [...getComponents(), ...newComps];
        setComponents(merged);
        if (typeof refreshModel === 'function') refreshModel();
        else {
          renderer.addComponents ? renderer.addComponents(newComps, getDomain()) : renderer.loadComponents(merged, getDomain());
          emit('model-loaded', { components: merged, domain: getDomain(), source: 'macro-terminal', sourceName: 'macro-terminal', loadedAt: Date.now() });
        }
      }
      emit('debug:trace', { scope: 'macro-terminal', event: 'COMMAND_EXECUTED', ok: true, timestamp: Date.now(), details: { line, createdCount: newComps.length } });
      pushHistory({
        label: line,
        createdIds: newComps.map((comp) => comp.id),
        undoMessage: `Undo: removed ${newComps.length} component(s)`,
        undo() {
          const next = removeByIds(getComponents(), newComps.map((comp) => comp.id));
          setComponents(next);
          renderer.loadComponents(next, getDomain());
          emit('model-loaded', { components: next, domain: getDomain(), source: 'macro-undo', sourceName: 'macro-undo', loadedAt: Date.now() });
          emit('debug:trace', { scope: 'macro-terminal', event: 'UNDO', ok: true, timestamp: Date.now(), details: { removedCount: newComps.length } });
        },
      });
    }
    updateBadges();
  }

  const printHelp = () => HELP_LINES.forEach((line) => log(line, '#60a5fa'));
  const setScript = (script = '') => (el.scriptTextarea.value = normalizeMacroScriptText(script));
  const getScript = () => normalizeMacroScriptText(el.scriptTextarea.value || '');
  const toggleScriptPanel = (force = null) => {
    const nextVisible = force == null ? el.scriptPanel.style.display === 'none' : Boolean(force);
    el.scriptPanel.style.display = nextVisible ? 'block' : 'none';
    return nextVisible;
  };
  const exportMacroReport = (report = null, prefix = 'macro-report') => {
    if (!report) { log('• No macro report available to export', '#94a3b8'); return null; }
    const payload = createMacroReportDownloadPayload(report, { prefix });
    downloadText(payload.filename, payload.text, payload.mime);
    log(`✓ Exported ${payload.filename}`, '#4ade80');
    return payload;
  };
  const exportLastReport = () => {
    if (!lastScriptReport) { log('• No macro script report available to export', '#94a3b8'); return null; }
    const payload = createMacroScriptDownloadPayload(lastScriptReport);
    downloadText(payload.filename, payload.text, payload.mime);
    log(`✓ Exported ${payload.filename}`, '#4ade80');
    return payload;
  };
  const exportLastLintReport = () => lastScriptLintReport ? exportMacroReport(lastScriptLintReport, 'macro-script-lint-report') : (log('• No macro lint report available to export', '#94a3b8'), null);
  const exportLastRunBlockedReport = () => lastScriptRunBlockedReport ? exportMacroReport(lastScriptRunBlockedReport, 'macro-script-run-blocked-report') : (log('• No macro blocked-run report available to export', '#94a3b8'), null);

  function lintScript(script = getScript(), options = {}) {
    const report = lintMacroScript(script, { sourceName: options.sourceName || 'macro-terminal-lint', generatedAt: options.generatedAt, enforceKnownCommands: options.enforceKnownCommands !== false });
    lastScriptLintReport = report;
    for (const entry of report.results) {
      log(`${entry.ok ? '✓' : '✗'} LINT [${entry.line}] ${entry.command}`, entry.ok ? '#94a3b8' : '#ef4444');
      for (const issue of entry.issues || []) log(`  ${issue.severity.toUpperCase()}: ${issue.message}`, issue.severity === 'error' ? '#ef4444' : '#fbbf24');
    }
    const summary = formatMacroScriptLintSummary(report);
    log(summary, report.ok ? '#4ade80' : '#ef4444');
    setStatus(report.ok ? 'idle' : 'error', summary);
    emit('debug:trace', { scope: 'macro-terminal', event: 'SCRIPT_LINT_RESULT', ok: report.ok, timestamp: Date.now(), details: { summary: report.summary, sourceName: report.sourceName } });
    return report;
  }

  const getFilteredScriptLibrary = () => filterMacroScriptLibrary(scriptLibrary, scriptLibraryFilterQuery);
  const getScriptLibraryFilter = () => scriptLibraryFilterQuery;
  function refreshScriptLibrarySelect(selectedId = null) {
    scriptLibrary = sortMacroScriptLibrary(scriptLibrary);
    const filteredLibrary = getFilteredScriptLibrary();
    const previousSelection = selectedId || el.scriptLibrarySelect.value || '';
    el.scriptLibrarySelect.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = !scriptLibrary.length ? 'No saved scripts' : (!filteredLibrary.length ? 'No matching scripts' : (scriptLibraryFilterQuery ? `Select saved script… (${filteredLibrary.length}/${scriptLibrary.length})` : 'Select saved script…'));
    el.scriptLibrarySelect.appendChild(empty);
    for (const entry of filteredLibrary) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = formatMacroScriptLibraryOptionLabel(entry);
      el.scriptLibrarySelect.appendChild(option);
    }
    if (previousSelection && filteredLibrary.some((entry) => entry.id === previousSelection)) el.scriptLibrarySelect.value = previousSelection;
    else if (selectedId && filteredLibrary.some((entry) => entry.id === selectedId)) el.scriptLibrarySelect.value = selectedId;
    return filteredLibrary;
  }
  function setScriptLibraryFilter(query = '') {
    scriptLibraryFilterQuery = String(query || '').trim();
    if (el.scriptLibraryFilter) el.scriptLibraryFilter.value = scriptLibraryFilterQuery;
    refreshScriptLibrarySelect(el.scriptLibrarySelect.value || null);
    return scriptLibraryFilterQuery;
  }
  const persistScriptLibrary = (selectedId = null) => {
    scriptLibrary = saveMacroScriptLibraryToStorage(macroScriptStorage, scriptLibrary);
    refreshScriptLibrarySelect(selectedId);
    return scriptLibrary;
  };
  const getScriptLibrary = () => sortMacroScriptLibrary(scriptLibrary);
  function saveCurrentScriptToLibrary(name = '') {
    const selected = el.scriptLibrarySelect.value || '';
    const existing = selected ? findMacroScriptLibraryEntry(scriptLibrary, selected) : null;
    const result = upsertMacroScriptLibraryEntry(scriptLibrary, {
      id: existing?.id || null,
      name: name || el.scriptLibraryName.value || existing?.name || 'Untitled Macro Script',
      script: getScript(),
      tags: parseMacroScriptTags(el.scriptLibraryTags.value || existing?.tags || []),
    });
    scriptLibrary = result.entries;
    el.scriptLibraryName.value = result.entry.name;
    el.scriptLibraryTags.value = formatMacroScriptTags(result.entry.tags);
    persistScriptLibrary(result.entry.id);
    log(`✓ Saved script: ${result.entry.name}`, '#4ade80');
    return result.entry;
  }
  function loadScriptFromLibrary(id = '') {
    const entry = findMacroScriptLibraryEntry(scriptLibrary, id || el.scriptLibrarySelect.value);
    if (!entry) { log('• Select a saved macro script to load', '#94a3b8'); return null; }
    setScript(entry.script);
    el.scriptLibraryName.value = entry.name;
    el.scriptLibraryTags.value = formatMacroScriptTags(entry.tags);
    el.scriptLibrarySelect.value = entry.id;
    toggleScriptPanel(true);
    log(`✓ Loaded script: ${entry.name}`, '#4ade80');
    return entry;
  }
  function deleteScriptFromLibrary(id = '') {
    const result = removeMacroScriptLibraryEntry(scriptLibrary, id || el.scriptLibrarySelect.value);
    if (!result.removed) { log('• Select a saved macro script to delete', '#94a3b8'); return null; }
    scriptLibrary = result.entries;
    persistScriptLibrary();
    if (el.scriptLibraryName.value === result.removed.name) {
      el.scriptLibraryName.value = '';
      el.scriptLibraryTags.value = '';
    }
    log(`✓ Deleted script: ${result.removed.name}`, '#fbbf24');
    return result.removed;
  }
  function updateScriptLibraryEntryMetadata(id = '', metadata = {}) {
    const scriptId = id || el.scriptLibrarySelect.value;
    if (!scriptId) { log('• Select a saved macro script to update metadata', '#94a3b8'); return null; }
    const result = updateMacroScriptLibraryEntryMetadata(scriptLibrary, scriptId, { name: metadata.name ?? el.scriptLibraryName.value, tags: metadata.tags ?? parseMacroScriptTags(el.scriptLibraryTags.value) });
    scriptLibrary = result.entries;
    el.scriptLibraryName.value = result.entry.name;
    el.scriptLibraryTags.value = formatMacroScriptTags(result.entry.tags);
    persistScriptLibrary(result.entry.id);
    log(`✓ Updated metadata: ${result.entry.name}`, '#4ade80');
    return result.entry;
  }
  const exportScriptLibrary = () => {
    const payload = createMacroScriptLibraryDownloadPayload(scriptLibrary);
    downloadText(payload.filename, payload.text, payload.mime);
    log(`✓ Exported ${payload.filename}`, '#4ade80');
    return payload;
  };
  function importScriptLibraryFromJson(jsonText = '', options = {}) {
    const mode = options.mode === 'replace' ? 'replace' : 'merge';
    const validation = validateMacroScriptLibraryImportJson(jsonText);
    const result = importMacroScriptLibraryJson(scriptLibrary, jsonText, { mode, now: options.now || null });
    scriptLibrary = result.entries;
    persistScriptLibrary();
    log(`✓ Imported ${validation.count} script(s) into library (${mode}; total=${scriptLibrary.length})`, '#4ade80');
    return { ...result, validation };
  }
  const importScriptLibraryFromFile = async (file, options = {}) => importScriptLibraryFromJson(await readTextFile(file), options);

  function executeInputLine(line) {
    setStatus('active', 'Executing macro command…');
    log(`> ${line}`, '#94a3b8');
    try {
      const result = executeMacro(line, ctx);
      applyResult(result, line);
      setStatus('idle', result?.message || 'Macro command executed');
      if (!result?.comp && !result?.comps?.length) emit('debug:trace', { scope: 'macro-terminal', event: 'COMMAND_RESULT', ok: true, timestamp: Date.now(), details: { line, message: result?.message || '' } });
    } catch (err) {
      log(`✗ ${err.message}`, '#ef4444');
      setStatus('error', err.message);
      emit('debug:trace', { scope: 'macro-terminal', event: 'COMMAND_ERROR', ok: false, timestamp: Date.now(), details: { line, message: err.message } });
    }
  }
  function runScript(script, options = {}) {
    const normalizedOptions = normalizeMacroScriptRunOptions({ ...options, sourceName: options.sourceName || 'macro-terminal-script' });
    const lintReport = normalizedOptions.lintBeforeRun ? lintScript(script, { sourceName: `${normalizedOptions.sourceName}-preflight`, enforceKnownCommands: true }) : null;
    const runDecision = shouldRunMacroScriptAfterLint(lintReport, normalizedOptions);
    if (!runDecision.ok) {
      const blockedReport = createMacroScriptRunBlockedReport(script, lintReport, { sourceName: normalizedOptions.sourceName });
      lastScriptRunBlockedReport = blockedReport;
      const summary = formatMacroScriptRunBlockedSummary(blockedReport);
      log(summary, '#ef4444');
      setStatus('error', summary);
      emit('debug:trace', { scope: 'macro-terminal', event: 'SCRIPT_RUN_BLOCKED', ok: false, timestamp: Date.now(), details: { summary: blockedReport.summary, sourceName: blockedReport.sourceName } });
      updateBadges();
      return blockedReport;
    }
    const report = executeMacroScriptReport(script, ctx, { stopOnError: normalizedOptions.stopOnError, throwOnError: false, sourceName: normalizedOptions.sourceName });
    lastScriptReport = report;
    lastScriptRunBlockedReport = null;
    for (const entry of report.results) {
      log(`> [${entry.line}] ${entry.command}`, '#94a3b8');
      if (entry.ok) applyResult(entry.result, entry.command);
      else log(`✗ [${entry.line}] ${entry.error?.message || 'Macro script line failed'}`, '#ef4444');
    }
    const summary = formatMacroScriptSummary(report);
    log(summary, report.ok ? '#4ade80' : '#ef4444');
    setStatus(report.ok ? 'idle' : 'error', summary);
    emit('debug:trace', { scope: 'macro-terminal', event: 'SCRIPT_RESULT', ok: report.ok, timestamp: Date.now(), details: { summary: report.summary, sourceName: report.sourceName, lintBeforeRun: normalizedOptions.lintBeforeRun } });
    updateBadges();
    return report;
  }

  el.scriptToggle.addEventListener('click', () => toggleScriptPanel());
  el.runScriptBtn.addEventListener('click', () => runScript(getScript(), { stopOnError: Boolean(el.scriptStopOnError.checked), lintBeforeRun: Boolean(el.scriptLintBeforeRun.checked), sourceName: 'macro-terminal-panel' }));
  el.scriptExample.addEventListener('click', () => { setScript(buildMacroScriptExample()); toggleScriptPanel(true); });
  el.scriptLint.addEventListener('click', () => lintScript(getScript(), { sourceName: 'macro-terminal-panel-lint' }));
  el.scriptClear.addEventListener('click', () => setScript(''));
  el.scriptExport.addEventListener('click', exportLastReport);
  el.scriptExportLint.addEventListener('click', exportLastLintReport);
  el.scriptExportBlocked.addEventListener('click', exportLastRunBlockedReport);
  el.scriptLibrarySave.addEventListener('click', () => saveCurrentScriptToLibrary());
  el.scriptLibraryUpdateMeta.addEventListener('click', () => updateScriptLibraryEntryMetadata());
  el.scriptLibraryLoad.addEventListener('click', () => loadScriptFromLibrary());
  el.scriptLibraryDelete.addEventListener('click', () => deleteScriptFromLibrary());
  el.scriptLibraryExport.addEventListener('click', exportScriptLibrary);
  el.scriptLibraryImport.addEventListener('click', () => { el.scriptLibraryFile.value = ''; el.scriptLibraryFile.click(); });
  el.scriptLibraryFile.addEventListener('change', async () => {
    const file = el.scriptLibraryFile.files?.[0];
    if (!file) return;
    try { await importScriptLibraryFromFile(file, { mode: el.scriptLibraryImportMode.value || 'merge' }); }
    catch (err) { log(`✗ Import failed: ${err.message}`, '#ef4444'); setStatus('error', err.message); }
  });
  el.scriptLibrarySelect.addEventListener('change', () => {
    const entry = findMacroScriptLibraryEntry(scriptLibrary, el.scriptLibrarySelect.value);
    if (entry) {
      el.scriptLibraryName.value = entry.name;
      el.scriptLibraryTags.value = formatMacroScriptTags(entry.tags);
    }
  });
  el.scriptLibraryFilter.addEventListener('input', () => setScriptLibraryFilter(el.scriptLibraryFilter.value || ''));
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const line = el.input.value.trim();
      if (!line) return;
      inputHistory.unshift(line);
      hIdx = -1;
      el.input.value = '';
      executeInputLine(line);
      return;
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); hIdx = Math.min(hIdx + 1, inputHistory.length - 1); el.input.value = inputHistory[hIdx] || ''; return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); hIdx = Math.max(hIdx - 1, -1); el.input.value = hIdx >= 0 ? inputHistory[hIdx] : ''; return; }
    if (e.key === 'F1') { e.preventDefault(); printHelp(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); el.output.innerHTML = ''; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const res = undoLast({ getComponents, setComponents, getDomain, renderer });
      if (res.ok) { log(`↶ ${res.message}`, '#fbbf24'); setStatus('idle', res.message); }
      else log(`• ${res.message}`, '#94a3b8');
      updateBadges();
    }
  });
  el.toggle.addEventListener('click', () => {
    const collapsed = el.output.style.display === 'none';
    el.output.style.display = collapsed ? 'block' : 'none';
    el.inputRow.style.display = collapsed ? 'flex' : 'none';
    el.toggle.textContent = collapsed ? '▼' : '▲';
  });
  host.addEventListener('macro:dump', () => downloadText('macro-terminal-history.txt', inputHistory.slice().reverse().join('\n')));

  refreshScriptLibrarySelect();
  printHelp();
  updateBadges();
  return {
    host, ctx, runScript, lintScript, setScript, getScript, toggleScriptPanel, exportLastReport, exportMacroReport,
    exportLastLintReport, exportLastRunBlockedReport, getLastScriptReport: () => lastScriptReport, getLastScriptLintReport: () => lastScriptLintReport,
    getLastScriptRunBlockedReport: () => lastScriptRunBlockedReport, getScriptLibrary, saveCurrentScriptToLibrary, loadScriptFromLibrary,
    deleteScriptFromLibrary, updateScriptLibraryEntryMetadata, exportScriptLibrary, importScriptLibraryFromJson, importScriptLibraryFromFile,
    setScriptLibraryFilter, getScriptLibraryFilter, getFilteredScriptLibrary, refreshScriptLibrarySelect,
  };
}
