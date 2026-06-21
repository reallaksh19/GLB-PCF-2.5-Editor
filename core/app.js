/**
 * Application bootstrap.
 * Registers the piping domain, wires tab routing, and initializes active tabs.
 */

import { registerDomain } from './domain-registry.js';
import { appLogger } from '../js/debug/logger.js';
import { capabilities } from '../js/capabilities/capability-registry.js';
import { domain as pipingDomain } from '../domains/piping/index.js';
import { initViewerTab } from '../js/tabs/viewer-tab.js';
import { initDebugTab } from '../js/tabs/debug-tab.js';
import { initBm1DashboardPanel } from '../js/ui/bm1-dashboard-panel.js';
import { TAB_IDS, PANEL_IDS } from '../js/ui/viewer-ui-contract.js';

window.capabilities = capabilities;

const TABS = ['viewer', 'debug', 'design'];
const BM1_DASHBOARD_TOGGLE_ID = 'hifi-btn-bm1-dashboard';

let _activeTab = null;
let _destroyFn = null;
let _bm1DashboardApi = null;

function switchTab(target) {
  if (target === 'design') return;
  if (target === _activeTab) return;

  if (typeof _destroyFn === 'function') {
    try {
      _destroyFn();
    } catch (error) {
      console.warn('[App] destroy error', error);
    }
    _destroyFn = null;
  }

  TABS.forEach((id) => {
    const tabId = TAB_IDS[id];
    const panelId = PANEL_IDS[id];
    document.getElementById(tabId)?.classList.toggle('active', id === target);
    document.getElementById(panelId)?.classList.toggle('active', id === target);
  });

  _activeTab = target;
}

function initTabRouter() {
  TABS.forEach((id) => {
    document.getElementById(TAB_IDS[id])?.addEventListener('click', () => switchTab(id));
  });

  const designBtn = document.getElementById(TAB_IDS.design);
  if (designBtn) {
    designBtn.classList.add('disabled');
    designBtn.setAttribute('aria-disabled', 'true');
    designBtn.setAttribute('title', 'Design tab is disabled in this release');
  }
}

function initTheme() {
  const stored = localStorage.getItem('glb-pcf-editor-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);

  document.getElementById('hifi-theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('glb-pcf-editor-theme', next);
  });
}

function initBm1Dashboard() {
  const host = document.getElementById('hifi-viewer-stage');
  const shellApi = window.__viewerShell || null;
  _bm1DashboardApi?.destroy?.();
  _bm1DashboardApi = initBm1DashboardPanel({
    host,
    shellApi,
    setStatus: (tone, text) => shellApi?.setViewerStatus?.(text, tone),
  });
  if (_bm1DashboardApi && typeof window !== 'undefined') window.__bm1Dashboard = _bm1DashboardApi;
  initBm1DashboardToolbarToggle(shellApi);
}

function initBm1DashboardToolbarToggle(shellApi) {
  const toolbar = document.getElementById('hifi-viewer-toolbar');
  if (!toolbar || document.getElementById(BM1_DASHBOARD_TOGGLE_ID)) return;
  const anchor = document.getElementById('hifi-btn-macro-toggle') || document.getElementById('hifi-btn-fit-main');
  const button = document.createElement('button');
  button.id = BM1_DASHBOARD_TOGGLE_ID;
  button.className = 'hifi-btn active';
  button.type = 'button';
  button.textContent = 'BM1';
  button.title = 'Show or hide BM1 benchmark dashboard';
  button.addEventListener('click', () => {
    const visible = _bm1DashboardApi?.toggle?.();
    button.classList.toggle('active', Boolean(visible));
    shellApi?.setViewerStatus?.(visible ? 'BM1 dashboard shown' : 'BM1 dashboard hidden', visible ? 'active' : 'idle');
  });
  if (anchor?.parentNode === toolbar) anchor.insertAdjacentElement('afterend', button);
  else toolbar.appendChild(button);
}

async function boot() {
  try {
    if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
      await import('../js/mock/register-mocks.js');
    }

    initTheme();
    registerDomain(pipingDomain);
    appLogger.info('DOMAIN_REGISTERED', { name: pipingDomain.name });

    initTabRouter();
    switchTab('viewer');

    initViewerTab();
    initBm1Dashboard();
    initDebugTab();

    appLogger.info('APP_BOOT_COMPLETE');
    console.info('[GLB-PCF-Editor] Boot complete.');
  } catch (error) {
    appLogger.error('APP_BOOT_FAILED', { message: String(error?.message || error) });
    console.error('[GLB-PCF-Editor] Boot failed:', error);
  }
}

document.addEventListener('DOMContentLoaded', boot);
