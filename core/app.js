/**
 * core/app.js — Application bootstrap.
 * Registers the piping domain, wires the 2-tab router, and initialises each tab.
 */

import { registerDomain } from './domain-registry.js';
import { appLogger }       from '../js/debug/logger.js';
import { capabilities }    from '../js/capabilities/capability-registry.js';

// ── Domain plugins ────────────────────────────────────────────────
import { domain as pipingDomain } from '../domains/piping/index.js';

// ── Tab modules ───────────────────────────────────────────────────
import { initViewerTab } from '../js/tabs/viewer-tab.js';
import { initDebugTab }  from '../js/tabs/debug-tab.js';

// Expose on window for Playwright tests and console access
window.capabilities = capabilities;

// ── Tab IDs must match id="rtab-{id}" / id="panel-{id}" in index.html ──
const TABS = ['viewer', 'debug'];

let _activeTab = null;
let _destroyFn  = null;

function switchTab(target) {
  if (target === _activeTab) return;

  // Cleanup previous tab if it provided a destroy fn
  if (typeof _destroyFn === 'function') {
    try { _destroyFn(); } catch (e) { console.warn('[App] destroy error', e); }
    _destroyFn = null;
  }

  TABS.forEach(id => {
    document.getElementById(`rtab-${id}`)?.classList.toggle('active', id === target);
    document.getElementById(`panel-${id}`)?.classList.toggle('active', id === target);
  });

  _activeTab = target;
}

function initTabRouter() {
  TABS.forEach(id => {
    document.getElementById(`rtab-${id}`)
      ?.addEventListener('click', () => switchTab(id));
  });
}

function initTheme() {
  const stored = localStorage.getItem('glb-pcf-editor-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);

  document.getElementById('btn-theme-toggle')
    ?.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('glb-pcf-editor-theme', next);
    });
}

async function boot() {
  try {
    // Dev-only: register all capability mock runners for 🔬 buttons / Playwright.
    if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
      await import('../js/mock/register-mocks.js');
    }

    // 1. Theme
    initTheme();

    // 2. Register domains
    registerDomain(pipingDomain);
    appLogger.info('DOMAIN_REGISTERED', { name: pipingDomain.name });

    // 3. Tab router
    initTabRouter();
    switchTab('viewer');

    // 4. Initialise tabs
    initViewerTab();
    initDebugTab();

    appLogger.info('APP_BOOT_COMPLETE');
    console.info('[GLB-PCF-Editor] Boot complete.');
  } catch (err) {
    appLogger.error('APP_BOOT_FAILED', { message: String(err?.message || err) });
    console.error('[GLB-PCF-Editor] Boot failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', boot);
