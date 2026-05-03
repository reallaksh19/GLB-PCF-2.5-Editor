/**
 * @file js/capabilities/capability-registry.js
 * @description Tracks which features are implemented and ready.
 *              Drives the grey-out / enable state of all toolbar buttons.
 *              Also manages the "🔬 Mock" result overlay.
 *
 * Usage (in an implementation file, after self-check passes):
 *   import { capabilities } from '../../js/capabilities/capability-registry.js';
 *   capabilities.ready('scene-renderer');
 *
 * Usage (to report failure):
 *   capabilities.fail('scene-renderer', ['meshCount: expected 8, got 0']);
 *
 * Usage (to register a mock runner for a capability):
 *   capabilities.registerMock('pcf-parse', async () => {
 *     const result = ...;
 *     return { pass: true, assertions: [{ label: 'count', expected: 10, actual: 10 }] };
 *   });
 */

// ── Capability definitions ────────────────────────────────────────────────────
// Maps capability ID → array of [data-cap] selector values that it unlocks.
const CAP_ELEMENTS = {
  'pcf-parse':        ['pcf-parse'],
  'scene-renderer':   ['scene-renderer'],
  'heatmap':          ['heatmap'],
  'labels':           ['labels'],
  'component-panel':  ['component-panel'],
  'theme':            ['theme'],
  'glb-load':         ['glb-load'],
  'glb-export':       ['glb-export'],
  'dxf-import':       ['dxf-import'],
  'dxf-export':       ['dxf-export'],
  'debug-tab':        ['debug-tab'],
  'support-symbols':  [],  // visual only — no dedicated button
  'css2d-labels':     ['labels'],
};

// ── State ─────────────────────────────────────────────────────────────────────
const _status   = {};   // capId → 'placeholder' | 'ready' | 'failed'
const _mocks    = {};   // capId → async fn → { pass, assertions }
const _failures = {};   // capId → string[]
const _subs     = [];   // global subscribers

// Initialise all as placeholder
Object.keys(CAP_ELEMENTS).forEach(id => { _status[id] = 'placeholder'; });

// ── DOM helpers ───────────────────────────────────────────────────────────────
function _elementsFor(capId) {
  const selectors = CAP_ELEMENTS[capId] || [];
  return selectors.flatMap(sel =>
    [...document.querySelectorAll(`[data-cap="${sel}"]`)]
  );
}

function _applyPlaceholder(capId) {
  _elementsFor(capId).forEach(el => {
    el.disabled        = true;
    el.style.opacity   = '0.35';
    el.style.cursor    = 'not-allowed';
    el.title           = `[${capId}] Not yet implemented — see wi/WI-${capId}.md`;
    el.setAttribute('aria-disabled', 'true');
  });
  _updateChip(capId, 'placeholder');
}

function _applyReady(capId) {
  _elementsFor(capId).forEach(el => {
    el.disabled        = false;
    el.style.opacity   = '';
    el.style.cursor    = '';
    el.title           = '';
    el.removeAttribute('aria-disabled');
  });
  _updateChip(capId, 'ready');
}

function _applyFailed(capId) {
  _elementsFor(capId).forEach(el => {
    el.disabled        = true;
    el.style.opacity   = '0.5';
    el.style.cursor    = 'not-allowed';
    el.title           = `[${capId}] Self-check failed — see console`;
  });
  _updateChip(capId, 'failed');
}

function _updateChip(capId, status) {
  const chip = document.querySelector(`[data-cap-chip="${capId}"]`);
  if (!chip) return;
  chip.textContent = status === 'ready'  ? '●'
                   : status === 'failed' ? '✗'
                   :                       '○';
  chip.style.color = status === 'ready'  ? '#4ade80'
                   : status === 'failed' ? '#ef4444'
                   :                       '#64748b';
  chip.title = status === 'failed'
    ? (_failures[capId] || []).join('\n')
    : status;
}

// ── Mock result overlay ───────────────────────────────────────────────────────
let _overlayEl = null;

function _ensureOverlay() {
  if (_overlayEl) return _overlayEl;
  _overlayEl = document.createElement('div');
  _overlayEl.id = 'mock-result-panel';
  Object.assign(_overlayEl.style, {
    position:     'fixed',
    bottom:       '48px',
    right:        '12px',
    width:        '360px',
    background:   'rgba(15,23,42,0.97)',
    border:       '1px solid #3a4255',
    borderRadius: '6px',
    padding:      '12px 14px',
    fontFamily:   'monospace',
    fontSize:     '12px',
    color:        '#e8eaf0',
    zIndex:       '9999',
    display:      'none',
    boxShadow:    '0 4px 24px rgba(0,0,0,0.6)',
  });
  document.body.appendChild(_overlayEl);
  return _overlayEl;
}

function _showMockResult(capId, result) {
  const overlay = _ensureOverlay();
  const passCount = result.assertions.filter(a => a.pass).length;
  const total     = result.assertions.length;
  const allPass   = result.pass;

  const rows = result.assertions.map(a => {
    const icon = a.pass ? '✅' : '❌';
    return `<div style="margin:3px 0">${icon} &nbsp;${a.label}: expected <b>${a.expected}</b>, got <b>${a.actual}</b></div>`;
  }).join('');

  const failures = (_failures[capId] || []).map(f =>
    `<div style="color:#ef4444;margin:2px 0">✗ ${f}</div>`
  ).join('');

  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="color:${allPass ? '#4ade80' : '#ef4444'}">
        ${allPass ? '✅ PASS' : '❌ FAIL'} &nbsp;(${passCount}/${total} assertions)
      </b>
      <span style="color:#64748b;font-size:11px">${capId}</span>
      <button onclick="this.parentElement.parentElement.style.display='none'"
        style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px">✕</button>
    </div>
    <div style="border-top:1px solid #3a4255;padding-top:8px">
      ${rows}
      ${failures}
    </div>
    <div style="margin-top:8px;color:#64748b;font-size:10px">
      Mock loaded: ${new Date().toISOString().slice(11,23)}
    </div>
  `;
  overlay.style.display = 'block';

  // Auto-hide after 30s
  setTimeout(() => { if (overlay.style.display !== 'none') overlay.style.display = 'none'; }, 30000);
}

// ── Public API ────────────────────────────────────────────────────────────────
export const capabilities = {

  /**
   * Mark a capability as ready. Called by implementations after self-check passes.
   * @param {string} capId
   */
  ready(capId) {
    _status[capId] = 'ready';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => _applyReady(capId));
    } else {
      _applyReady(capId);
    }
    _subs.forEach(fn => fn({ capId, status: 'ready' }));
    console.info(`[capabilities] ✅ ${capId} ready`);
  },

  /**
   * Mark a capability as failed. Shown as red chip + failure details.
   * @param {string} capId
   * @param {string[]} reasons
   */
  fail(capId, reasons = []) {
    _status[capId]   = 'failed';
    _failures[capId] = reasons;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => _applyFailed(capId));
    } else {
      _applyFailed(capId);
    }
    _subs.forEach(fn => fn({ capId, status: 'failed', reasons }));
    console.error(`[capabilities] ✗ ${capId} failed:`, reasons);
  },

  /**
   * Register a mock runner for a capability.
   * The runner is called when the 🔬 Mock button is clicked.
   * @param {string} capId
   * @param {function(): Promise<{pass:boolean, assertions:Array}>} runnerFn
   */
  registerMock(capId, runnerFn) {
    _mocks[capId] = runnerFn;
  },

  /**
   * Run the mock for a capability and show the result overlay.
   * Called by the 🔬 Mock buttons in the toolbar.
   * @param {string} capId
   */
  async runMock(capId) {
    const runner = _mocks[capId];
    if (!runner) {
      _showMockResult(capId, {
        pass: false,
        assertions: [{ pass: false, label: 'mock runner registered', expected: true, actual: false }],
      });
      return;
    }
    try {
      const result = await runner();
      _showMockResult(capId, result);
    } catch (err) {
      _showMockResult(capId, {
        pass: false,
        assertions: [{ pass: false, label: 'mock runner threw', expected: 'no error', actual: String(err.message) }],
      });
    }
  },

  /** Get current status of a capability */
  getStatus(capId) { return _status[capId] || 'unknown'; },

  /** Get all statuses */
  all() { return { ..._status }; },

  /** Subscribe to status changes */
  subscribe(fn) { _subs.push(fn); return () => _subs.splice(_subs.indexOf(fn), 1); },
};

// ── Boot: apply placeholder state to all known capabilities ───────────────────
function _boot() {
  Object.keys(CAP_ELEMENTS).forEach(id => {
    if (_status[id] === 'placeholder') _applyPlaceholder(id);
  });

  // Wire all [data-cap-mock] buttons
  document.querySelectorAll('[data-cap-mock]').forEach(btn => {
    btn.addEventListener('click', () => {
      const capId = btn.dataset.capMock;
      capabilities.runMock(capId);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _boot);
} else {
  _boot();
}
