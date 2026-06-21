const CONTROL_STYLE = 'border:1px solid #3a4255;background:#252a3a;color:#e8eaf0;border-radius:4px;cursor:pointer;';
const INPUT_STYLE = 'min-width:150px;background:#070b14;border:1px solid #3a4255;border-radius:4px;color:#e8eaf0;font-family:monospace;font-size:11px;padding:4px 6px;';
const HTML = `
  <div id="macro-header" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #3a4255;">
    <span style="font-weight:600;color:#f59e0b;">⌨ MACRO TERMINAL</span>
    <span id="macro-route-badge" style="font-size:11px;color:#94a3b8;opacity:.85">idle</span>
    <span style="margin-left:auto;font-size:11px;color:#94a3b8;">History: <span id="macro-history-count">0</span> cmds</span>
    <button id="macro-script-toggle" style="${CONTROL_STYLE}">Script</button>
    <button id="macro-run-script" style="border:1px solid #3a4255;background:#1f3b2d;color:#bbf7d0;border-radius:4px;cursor:pointer;">Run</button>
    <button id="macro-toggle" style="${CONTROL_STYLE}">▼</button>
  </div>
  <div id="macro-output" style="max-height:140px;overflow:auto;padding:8px 10px;"></div>
  <div id="macro-script-panel" style="display:none;border-top:1px solid rgba(58,66,85,.5);padding:8px 10px;background:rgba(15,23,42,.75);">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-weight:600;color:#93c5fd;">SCRIPT</span>
      <label style="display:flex;align-items:center;gap:4px;color:#cbd5e1;font-size:11px;"><input id="macro-script-stop-on-error" type="checkbox" checked>Stop on error</label>
      <label style="display:flex;align-items:center;gap:4px;color:#cbd5e1;font-size:11px;"><input id="macro-script-lint-before-run" type="checkbox" checked>Lint before run</label>
      <button id="macro-script-example" style="${CONTROL_STYLE}">Example</button>
      <button id="macro-script-lint" style="border:1px solid #3a4255;background:#273449;color:#bfdbfe;border-radius:4px;cursor:pointer;">Lint</button>
      <button id="macro-script-clear" style="${CONTROL_STYLE}">Clear</button>
      <button id="macro-script-export" style="${CONTROL_STYLE}">Export Run</button>
      <button id="macro-script-export-lint" style="border:1px solid #3a4255;background:#252a3a;color:#bfdbfe;border-radius:4px;cursor:pointer;">Export Lint</button>
      <button id="macro-script-export-blocked" style="border:1px solid #3a4255;background:#3a1f1f;color:#fecaca;border-radius:4px;cursor:pointer;">Export Blocked</button>
      <input id="macro-script-library-name" placeholder="Script name" style="min-width:160px;background:#070b14;border:1px solid #3a4255;border-radius:4px;color:#e8eaf0;font-family:monospace;font-size:11px;padding:4px 6px;">
      <input id="macro-script-library-tags" placeholder="Tags: route, edit" style="${INPUT_STYLE}">
      <input id="macro-script-library-filter" placeholder="Filter scripts" style="${INPUT_STYLE}">
      <select id="macro-script-library-select" style="max-width:260px;${INPUT_STYLE}"></select>
      <button id="macro-script-library-save" style="border:1px solid #3a4255;background:#17324a;color:#bfdbfe;border-radius:4px;cursor:pointer;">Save Script</button>
      <button id="macro-script-library-update-meta" style="border:1px solid #3a4255;background:#1f2f46;color:#bfdbfe;border-radius:4px;cursor:pointer;">Update Meta</button>
      <button id="macro-script-library-load" style="${CONTROL_STYLE}">Load</button>
      <button id="macro-script-library-delete" style="border:1px solid #3a4255;background:#3a1f1f;color:#fecaca;border-radius:4px;cursor:pointer;">Delete</button>
      <button id="macro-script-library-export" style="${CONTROL_STYLE}">Export Library</button>
      <select id="macro-script-library-import-mode" style="max-width:110px;${INPUT_STYLE}"><option value="merge">Merge</option><option value="replace">Replace</option></select>
      <button id="macro-script-library-import" style="border:1px solid #3a4255;background:#2e2a1f;color:#fde68a;border-radius:4px;cursor:pointer;">Import Library</button>
      <input id="macro-script-library-file" type="file" accept="application/json,.json" style="display:none;">
    </div>
    <textarea id="macro-script-textarea" spellcheck="false" placeholder="LINE START=0,0,0 X1000&#10;ROUTES&#10;USE_ROUTE R-1" style="width:100%;min-height:120px;resize:vertical;background:#070b14;border:1px solid #3a4255;border-radius:6px;color:#e8eaf0;font-family:monospace;font-size:12px;padding:8px;box-sizing:border-box;"></textarea>
  </div>
  <div id="macro-input-row" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid rgba(58,66,85,.5);">
    <span style="color:#f59e0b">›</span>
    <input id="macro-input" autocomplete="off" spellcheck="false" placeholder="PIPE 0,0,0 3000,0,0 OD=168.3" style="flex:1;background:transparent;border:none;outline:none;color:#e8eaf0;font-family:monospace;font-size:12px;">
  </div>`;
const IDS = {
  input: '#macro-input', output: '#macro-output', toggle: '#macro-toggle', badge: '#macro-route-badge', countEl: '#macro-history-count',
  scriptToggle: '#macro-script-toggle', runScriptBtn: '#macro-run-script', scriptPanel: '#macro-script-panel', scriptTextarea: '#macro-script-textarea',
  scriptStopOnError: '#macro-script-stop-on-error', scriptLintBeforeRun: '#macro-script-lint-before-run', scriptExample: '#macro-script-example', scriptLint: '#macro-script-lint', scriptClear: '#macro-script-clear',
  scriptExport: '#macro-script-export', scriptExportLint: '#macro-script-export-lint', scriptExportBlocked: '#macro-script-export-blocked', scriptLibraryName: '#macro-script-library-name',
  scriptLibraryTags: '#macro-script-library-tags', scriptLibraryFilter: '#macro-script-library-filter', scriptLibrarySelect: '#macro-script-library-select', scriptLibrarySave: '#macro-script-library-save',
  scriptLibraryUpdateMeta: '#macro-script-library-update-meta', scriptLibraryLoad: '#macro-script-library-load', scriptLibraryDelete: '#macro-script-library-delete', scriptLibraryExport: '#macro-script-library-export',
  scriptLibraryImportMode: '#macro-script-library-import-mode', scriptLibraryImport: '#macro-script-library-import', scriptLibraryFile: '#macro-script-library-file', inputRow: '#macro-input-row',
};

export function createMacroTerminalHost(container) {
  const host = document.createElement('div');
  const isHiFiTray = container.id === 'hifi-macro-tray';
  host.id = 'macro-terminal';
  host.innerHTML = HTML;
  Object.assign(host.style, {
    position: isHiFiTray ? 'relative' : 'absolute', left: isHiFiTray ? 'auto' : '0', right: isHiFiTray ? 'auto' : '0', bottom: isHiFiTray ? 'auto' : '0', top: 'auto', inset: isHiFiTray ? 'auto' : 'auto 0 0 0',
    width: '100%', height: 'auto', background: 'rgba(10,14,26,0.97)', borderTop: isHiFiTray ? 'none' : '1px solid #3a4255', color: '#e8eaf0', fontFamily: 'monospace', fontSize: '12px', zIndex: '120', boxShadow: isHiFiTray ? 'none' : '0 -10px 24px rgba(0,0,0,.25)',
  });
  container.style.position ||= 'relative';
  container.appendChild(host);
  const elements = Object.fromEntries(Object.entries(IDS).map(([key, selector]) => [key, host.querySelector(selector)]));
  return { host, elements };
}
