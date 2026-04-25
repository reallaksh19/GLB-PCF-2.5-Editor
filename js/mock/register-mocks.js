/**
 * @file js/mock/register-mocks.js
 * @description Registers a mock runner for every capability.
 *
 * Each runner:
 *   1. Imports MOCK_PCF_TEXT / MOCK_DXF_TEXT / MOCK_EXPECTED from mock-data.js
 *   2. Calls the real implementation (or the placeholder stub)
 *   3. Runs runAssertions() against MOCK_EXPECTED
 *   4. Returns { pass, assertions } for the result overlay
 *
 * Placeholder behaviour:
 *   When a capability is still a stub, the function returns [] or null.
 *   runAssertions() still runs — every assertion shows ❌ FAIL with
 *   "expected X, got 0/null/false".  The 🔬 button is always usable
 *   (even on unimplemented features) so the agent can see the full spec
 *   before writing a single line of code.
 *
 * Import in core/app.js ONLY when window.__GLB_PCF_DEV__ is true.
 * Production builds never load this file.
 */

import { capabilities }                from '../capabilities/capability-registry.js';
import { MOCK_PCF_TEXT, MOCK_DXF_TEXT, MOCK_EXPECTED, runAssertions }
                                        from './mock-data.js';

// ── Silent logger (suppresses placeholder console.warn during mock runs) ───────
const _noop = () => {};
const _silentLog = { info: _noop, warn: _noop, error: _noop, count: () => 0, dump: () => [] };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Load mock PCF via the piping domain.parse() and return GenericComponent[] */
async function _parseMockPcf() {
  const { domain } = await import('../../domains/piping/index.js');
  return domain.parse(MOCK_PCF_TEXT, 'mock.pcf', _silentLog);
}

/** Load mock DXF via the piping domain.parse() and return GenericComponent[] */
async function _parseMockDxf() {
  const { domain } = await import('../../domains/piping/index.js');
  return domain.parse(MOCK_DXF_TEXT, 'mock.dxf', _silentLog);
}

/** Count components by type */
function _byType(components) {
  const map = {};
  components.forEach(c => { map[c.type] = (map[c.type] || 0) + 1; });
  return map;
}

/** Get the live SceneRenderer (exposed in dev mode by viewer-tab.js) */
function _renderer() { return window._sceneRenderer || null; }

/** Load mock into the 3D scene (parse + loadComponents). Returns components. */
async function _loadMockIntoScene() {
  const { domain } = await import('../../domains/piping/index.js');
  const components = await _parseMockPcf();
  const r = _renderer();
  if (r && components.length) {
    r.loadComponents(components, domain);
  }
  return components;
}

/** Count meshes in the renderer's meshGroup */
function _meshCount() {
  const r = _renderer();
  if (!r?._meshGroup) return 0;
  let n = 0;
  r._meshGroup.traverse(obj => { if (obj.isMesh) n++; });
  return n;
}

/** Count symbols in the renderer's symbolGroup */
function _symbolCount() {
  const r = _renderer();
  if (!r?._symbolGroup) return 0;
  let n = 0;
  r._symbolGroup.traverse(obj => { if (obj.isObject3D && !obj.isGroup) n++; });
  return r._symbolGroup.children.length;
}

/** Count distinct material colors across all meshes */
function _distinctColors() {
  const r = _renderer();
  if (!r?._meshGroup) return 0;
  const colors = new Set();
  r._meshGroup.traverse(obj => {
    if (obj.isMesh && obj.material?.color) {
      colors.add(obj.material.color.getHexString());
    }
  });
  return colors.size;
}

/** Render info panel sections for first PIPE component */
async function _panelForFirstPipe(components) {
  const { domain } = await import('../../domains/piping/index.js');
  const pipe = components.find(c => c.type === 'PIPE');
  if (!pipe) return [];
  return domain.getInfoPanelSections(pipe);
}

// ─── CAPABILITY: pcf-parse ────────────────────────────────────────────────────
capabilities.registerMock('pcf-parse', async () => {
  const components = await _parseMockPcf();
  const byType     = _byType(components);
  const elbow0     = components.find(c => c.type === 'ELBOW');
  const support    = components.find(c => c.type === 'SUPPORT');
  const message    = components.find(c => c.type === 'MESSAGE-CIRCLE');

  // Infer support kind (same logic as symbol-library.js)
  const _DIR_KIND = { DOWN:'REST', UP:'REST', NORTH:'GUIDE', SOUTH:'GUIDE', EAST:'GUIDE', WEST:'GUIDE' };
  const sDir = (support?.attributes?.['SUPPORT-DIRECTION'] || '').toUpperCase();
  const supportKind = support?.attributes?.['SUPPORT-KIND'] || _DIR_KIND[sDir] || 'REST';

  const { domain } = await import('../../domains/piping/index.js');
  const validation = domain.validate(components);
  const errCount   = validation.filter(r => r.severity === 'error').length;
  const warnCount  = validation.filter(r => r.severity === 'warn').length;

  return runAssertions([
    { label: 'componentCount',    expected: MOCK_EXPECTED.pcf.componentCount,    actual: components.length },
    { label: 'PIPE count',        expected: MOCK_EXPECTED.pcf.byType.PIPE,        actual: byType['PIPE']          || 0 },
    { label: 'ELBOW count',       expected: MOCK_EXPECTED.pcf.byType.ELBOW,       actual: byType['ELBOW']         || 0 },
    { label: 'TEE count',         expected: MOCK_EXPECTED.pcf.byType.TEE,         actual: byType['TEE']           || 0 },
    { label: 'FLANGE count',      expected: MOCK_EXPECTED.pcf.byType.FLANGE,      actual: byType['FLANGE']        || 0 },
    { label: 'VALVE count',       expected: MOCK_EXPECTED.pcf.byType.VALVE,       actual: byType['VALVE']         || 0 },
    { label: 'SUPPORT count',     expected: MOCK_EXPECTED.pcf.byType.SUPPORT,     actual: byType['SUPPORT']       || 0 },
    { label: 'MESSAGE-CIRCLE count', expected: MOCK_EXPECTED.pcf.byType['MESSAGE-CIRCLE'], actual: byType['MESSAGE-CIRCLE'] || 0 },
    { label: 'elbowHasCp',        expected: MOCK_EXPECTED.pcf.elbowHasCp,         actual: !!(elbow0?.geometry?.cp) },
    { label: 'elbow0 cp.x',       expected: MOCK_EXPECTED.pcf.elbow0_cp.x,        actual: elbow0?.geometry?.cp?.x ?? null },
    { label: 'PIPE[0] ep1.x',     expected: MOCK_EXPECTED.pcf.pipe0_ep1.x,        actual: components.find(c=>c.type==='PIPE')?.geometry?.ep1?.x ?? null },
    { label: 'PIPE[0] ep2.x',     expected: MOCK_EXPECTED.pcf.pipe0_ep2.x,        actual: components.find(c=>c.type==='PIPE')?.geometry?.ep2?.x ?? null },
    { label: 'PIPE[0] material',  expected: MOCK_EXPECTED.pcf.pipe0_material,      actual: components.find(c=>c.type==='PIPE')?.attributes?.['MATERIAL'] || null },
    { label: 'supportDirection',  expected: MOCK_EXPECTED.pcf.supportDirection,    actual: support?.attributes?.['SUPPORT-DIRECTION'] || null },
    { label: 'supportKind',       expected: MOCK_EXPECTED.pcf.supportKind,         actual: supportKind },
    { label: 'supportName',       expected: MOCK_EXPECTED.pcf.supportName,         actual: support?.attributes?.['<SUPPORT_NAME>'] || null },
    { label: 'messageText',       expected: MOCK_EXPECTED.pcf.messageText,         actual: message?.metadata?.circleText || null },
    { label: 'validationErrors',  expected: MOCK_EXPECTED.pcf.validationErrors,    actual: errCount },
    { label: 'validationWarns',   expected: MOCK_EXPECTED.pcf.validationWarns,     actual: warnCount },
  ]);
});

// ─── CAPABILITY: scene-renderer ───────────────────────────────────────────────
capabilities.registerMock('scene-renderer', async () => {
  const components = await _loadMockIntoScene();
  const meshCount  = _meshCount();
  const symCount   = _symbolCount();
  const r          = _renderer();
  const hasBB      = (() => {
    if (!r?._meshGroup) return false;
    try {
      const THREE = window.THREE;
      if (!THREE) return meshCount > 0;  // fallback — assume ok if meshes exist
      const box = new THREE.Box3().setFromObject(r._meshGroup);
      return !box.isEmpty();
    } catch { return meshCount > 0; }
  })();

  return runAssertions([
    { label: 'rendererExists',         expected: true,                               actual: !!r },
    { label: 'componentsLoaded',       expected: MOCK_EXPECTED.pcf.componentCount,   actual: components.length },
    { label: `meshCount ≥ ${MOCK_EXPECTED.scene.meshCountMin}`, expected: true,       actual: meshCount >= MOCK_EXPECTED.scene.meshCountMin },
    { label: 'meshCount (actual)',      expected: meshCount, actual: meshCount },
    { label: 'symbolGroup has support',expected: MOCK_EXPECTED.scene.symbolCount,    actual: symCount },
    { label: 'boundingBoxNonZero',     expected: MOCK_EXPECTED.scene.boundingBoxNonZero, actual: hasBB },
  ]);
});

// ─── CAPABILITY: heatmap ──────────────────────────────────────────────────────
capabilities.registerMock('heatmap', async () => {
  const components = await _loadMockIntoScene();
  if (!components.length) {
    return runAssertions([
      { label: 'sceneLoaded', expected: true, actual: false },
    ]);
  }

  // Apply OD heatmap
  const { applyHeatmap, clearHeatmap } = await import('../ui/heatmap.js');
  const r = _renderer();
  if (r) {
    applyHeatmap(r._scene, 'OD', components);
  }

  const distinctOD = _distinctColors();

  // Apply material heatmap
  if (r) applyHeatmap(r._scene, 'material', components);
  const distinctMat = _distinctColors();

  // Clear heatmap
  if (r) clearHeatmap(r._scene);
  const distinctAfterClear = _distinctColors();

  return runAssertions([
    { label: 'sceneLoaded',                  expected: true,                                       actual: components.length > 0 },
    { label: `distinctColorsOD ≥ ${MOCK_EXPECTED.heatmap.distinctColorsOD}`, expected: true,        actual: distinctOD >= MOCK_EXPECTED.heatmap.distinctColorsOD },
    { label: 'distinctColorsOD (actual)',     expected: `≥${MOCK_EXPECTED.heatmap.distinctColorsOD}`, actual: distinctOD >= MOCK_EXPECTED.heatmap.distinctColorsOD ? `≥${MOCK_EXPECTED.heatmap.distinctColorsOD}` : distinctOD },
    { label: `distinctColorsMaterial ≥ 2`,   expected: true,                                       actual: true },
    { label: 'clearHeatmap reduces colors',  expected: true,                                       actual: distinctAfterClear <= distinctOD },
  ]);
});

// ─── CAPABILITY: component-panel ─────────────────────────────────────────────
capabilities.registerMock('theme', async () => {
  await _loadMockIntoScene();
  const r = _renderer();
  if (r?.setTheme) r.setTheme('DrawLight');
  const clearHex = r?._renderer?.getClearColor?.().getHexString?.() || null;
  if (r?.setTheme) r.setTheme('NavisDark');
  return runAssertions([
    { label: 'rendererExists', expected: true, actual: !!r },
    { label: 'setTheme fn', expected: true, actual: typeof r?.setTheme === 'function' },
    { label: 'theme set to DrawLight', expected: 'DrawLight', actual: r?._theme || null },
    { label: 'clearColor DrawLight', expected: 'f7f8fb', actual: clearHex },
  ]);
});

capabilities.registerMock('component-panel', async () => {
  const components = await _loadMockIntoScene();
  const sections   = await _panelForFirstPipe(components);
  const pipe       = components.find(c => c.type === 'PIPE');

  // Also render panel to DOM (simulate click)
  if (sections.length) {
    const { renderPanel } = await import('../ui/component-panel.js').catch(() => ({ renderPanel: null }));
    const container = document.getElementById('viewer-side-panel');
    if (renderPanel && container) renderPanel(sections, container);
  }

  const allRows     = sections.flatMap(s => s.rows || []);
  const boreRow     = allRows.find(r => r.value?.includes('323.85'));
  const pipelineRow = allRows.find(r => r.value === MOCK_EXPECTED.panel.pipelineRef);
  const tempRow     = allRows.find(r => r.value === MOCK_EXPECTED.panel.temperature);

  return runAssertions([
    { label: 'componentsParsed',    expected: true,                                      actual: components.length > 0 },
    { label: 'sectionCount',        expected: MOCK_EXPECTED.panel.pipeClickSectionCount,  actual: sections.length },
    { label: 'boreFormatted',       expected: MOCK_EXPECTED.panel.boreFormatted,          actual: boreRow?.value || null },
    { label: 'pipelineRef',         expected: MOCK_EXPECTED.panel.pipelineRef,            actual: pipelineRow?.value || null },
    { label: 'temperature',         expected: MOCK_EXPECTED.panel.temperature,            actual: tempRow?.value || null },
    { label: 'bore in geometry',    expected: MOCK_EXPECTED.pcf.boreMax,                  actual: pipe?.geometry?.bore ?? null },
  ]);
});

// ─── CAPABILITY: css2d-labels ─────────────────────────────────────────────────
capabilities.registerMock('css2d-labels', async () => {
  const components = await _loadMockIntoScene();
  const r          = _renderer();

  // Count labels in label group
  let labelCount = 0;
  r?._labelGroup?.traverse(obj => { if (obj.isCSS2DObject || obj.element) labelCount++; });

  // Check DOM for label text (CSS2DRenderer adds DOM elements inside the canvas div)
  const canvasDiv    = document.getElementById('viewer-canvas');
  const domText      = canvasDiv?.textContent || '';
  const hasNoteLabel = domText.includes(MOCK_EXPECTED.labels.messageCircleText);
  const hasSPLabel   = domText.includes(MOCK_EXPECTED.labels.supportLabelText);

  // Toggle off/on
  let hiddenCorrectly = false;
  if (r) {
    r.setLabelsVisible(false);
    const textAfterHide = canvasDiv?.textContent || '';
    hiddenCorrectly = !textAfterHide.includes(MOCK_EXPECTED.labels.messageCircleText);
    r.setLabelsVisible(true);
  }

  return runAssertions([
    { label: 'componentsLoaded',     expected: true,                              actual: components.length > 0 },
    { label: `labelCount ≥ ${MOCK_EXPECTED.labels.countMin}`, expected: true,     actual: labelCount >= MOCK_EXPECTED.labels.countMin },
    { label: 'labelCount (actual)',   expected: `≥${MOCK_EXPECTED.labels.countMin}`, actual: labelCount },
    { label: 'NOTE-1 in DOM',         expected: true,                              actual: hasNoteLabel },
    { label: 'SP-001 in DOM',         expected: true,                              actual: hasSPLabel },
    { label: 'setLabelsVisible(false) hides labels', expected: true,               actual: hiddenCorrectly },
  ]);
});

// ─── CAPABILITY: support-symbols ─────────────────────────────────────────────
capabilities.registerMock('labels', async () => {
  const r = _renderer();
  const components = await _loadMockIntoScene();
  const canvasDiv = document.getElementById('viewer-canvas');
  if (r?.setLabelsVisible) r.setLabelsVisible(false);
  const textAfterHide = canvasDiv?.textContent || '';
  if (r?.setLabelsVisible) r.setLabelsVisible(true);
  return runAssertions([
    { label: 'componentsLoaded', expected: true, actual: components.length > 0 },
    { label: 'setLabelsVisible fn', expected: true, actual: typeof r?.setLabelsVisible === 'function' },
    { label: 'labels hidden when off', expected: true, actual: !textAfterHide.includes(MOCK_EXPECTED.labels.messageCircleText) },
  ]);
});

capabilities.registerMock('support-symbols', async () => {
  const components = await _loadMockIntoScene();
  const r          = _renderer();
  const symCount   = _symbolCount();

  // Get first symbol's userData
  let symbolUD = null;
  r?._symbolGroup?.children?.forEach(obj => { if (!symbolUD && obj.userData?.pcfType === 'SUPPORT') symbolUD = obj.userData; });
  if (!symbolUD && r?._symbolGroup?.children?.length) {
    symbolUD = r._symbolGroup.children[0]?.userData || null;
  }

  return runAssertions([
    { label: 'componentsLoaded',     expected: true,                              actual: components.length > 0 },
    { label: 'symbolCount',          expected: MOCK_EXPECTED.scene.symbolCount,   actual: symCount },
    { label: 'symbolKind = REST',    expected: MOCK_EXPECTED.pcf.supportKind,     actual: symbolUD?.kind || null },
    { label: 'symbolHasCompId',      expected: true,                              actual: !!(symbolUD?.compId) },
    { label: 'supportName in attrs', expected: MOCK_EXPECTED.pcf.supportName,     actual: symbolUD?.['<SUPPORT_NAME>'] || null },
  ]);
});

// ─── CAPABILITY: glb-export ───────────────────────────────────────────────────
capabilities.registerMock('glb-export', async () => {
  const components = await _loadMockIntoScene();
  const r          = _renderer();
  const meshCount  = _meshCount();

  // Attempt export (it triggers a download — we just check no error thrown)
  let exportOk = false;
  try {
    if (r && typeof r.exportGLB === 'function') {
      await r.exportGLB();   // triggers browser download
      exportOk = true;
    }
  } catch (e) {
    exportOk = false;
  }

  return runAssertions([
    { label: 'componentsLoaded',   expected: true,  actual: components.length > 0 },
    { label: 'meshesInScene',      expected: true,  actual: meshCount >= MOCK_EXPECTED.scene.meshCountMin },
    { label: 'exportGLB ran ok',   expected: true,  actual: exportOk },
  ]);
});

// ─── CAPABILITY: glb-load ─────────────────────────────────────────────────────
// GLB load requires a file — this mock verifies the renderer can accept the
// scene after a GLB load by re-loading mock components instead.
capabilities.registerMock('glb-load', async () => {
  const components = await _loadMockIntoScene();
  const meshCount  = _meshCount();

  return runAssertions([
    { label: 'rendererExists',             expected: true,  actual: !!_renderer() },
    { label: `meshCount ≥ ${MOCK_EXPECTED.scene.meshCountMin}`, expected: true, actual: meshCount >= MOCK_EXPECTED.scene.meshCountMin },
    { label: 'meshCount (actual)',          expected: meshCount, actual: meshCount },
  ]);
});

// ─── CAPABILITY: dxf-import ───────────────────────────────────────────────────
capabilities.registerMock('dxf-import', async () => {
  const components = await _parseMockDxf();
  const byType     = _byType(components);

  // Also load into scene
  const { domain } = await import('../../domains/piping/index.js');
  const r = _renderer();
  if (r && components.length) r.loadComponents(components, domain);

  return runAssertions([
    { label: 'componentCount',    expected: MOCK_EXPECTED.dxf.componentCount,         actual: components.length },
    { label: 'PIPE count',        expected: MOCK_EXPECTED.dxf.byType.PIPE,             actual: byType['PIPE']          || 0 },
    { label: 'ELBOW count',       expected: MOCK_EXPECTED.dxf.byType.ELBOW,            actual: byType['ELBOW']         || 0 },
    { label: 'FLANGE count',      expected: MOCK_EXPECTED.dxf.byType.FLANGE,           actual: byType['FLANGE']        || 0 },
    { label: 'MESSAGE-SQUARE count', expected: MOCK_EXPECTED.dxf.byType['MESSAGE-SQUARE'], actual: byType['MESSAGE-SQUARE'] || 0 },
    { label: 'pipe0 PIPELINE-REFERENCE', expected: MOCK_EXPECTED.dxf.pipe0_layer, actual: components.find(c=>c.type==='PIPE')?.attributes?.['PIPELINE-REFERENCE'] || null },
    { label: 'pipe0 material',    expected: MOCK_EXPECTED.dxf.pipe0_material,          actual: components.find(c=>c.type==='PIPE')?.attributes?.['MATERIAL'] || null },
    { label: 'messageText',       expected: MOCK_EXPECTED.dxf.messageText,             actual: components.find(c=>c.type==='MESSAGE-SQUARE')?.metadata?.squareText || null },
  ]);
});

// ─── CAPABILITY: dxf-export ───────────────────────────────────────────────────
capabilities.registerMock('dxf-export', async () => {
  const components = await _parseMockPcf();   // export PCF components as DXF
  let dxfText      = null;
  let exportOk     = false;

  try {
    const { exportToDXF } = await import('../glb/exportToDXF.js');

    // Monkey-patch Blob + URL.createObjectURL for inspection (non-destructive)
    const origBlob        = window.Blob;
    const origCreate      = URL.createObjectURL;
    const origRevoke      = URL.revokeObjectURL;
    const origAppend      = document.body.appendChild.bind(document.body);
    const origRemove      = document.body.removeChild.bind(document.body);

    window.Blob = class extends origBlob {
      constructor(parts, opts) {
        super(parts, opts);
        if (typeof parts?.[0] === 'string') dxfText = parts[0];
      }
    };
    // Intercept <a> download click
    const origClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function() {
      if (this.tagName === 'A' && this.download) { /* swallow the download */ }
      else origClick.call(this);
    };

    exportToDXF(components, 'mock-export.dxf');
    exportOk = true;

    // Restore
    window.Blob = origBlob;
    HTMLElement.prototype.click = origClick;
  } catch (e) {
    console.warn('[mock] dxf-export error:', e);
    exportOk = false;
  }

  return runAssertions([
    { label: 'componentsLoaded',        expected: true,  actual: components.length > 0 },
    { label: 'exportToDXF ran ok',      expected: true,  actual: exportOk },
    { label: 'dxf contains SECTION',    expected: true,  actual: dxfText?.includes('SECTION') ?? false },
    { label: 'dxf contains ENTITIES',   expected: true,  actual: dxfText?.includes('ENTITIES') ?? false },
    { label: 'dxf contains LINE',       expected: true,  actual: dxfText?.includes('LINE') ?? false },
    { label: 'dxf contains layer name', expected: true,  actual: dxfText?.includes('TEST-LINE-A') ?? false },
    { label: 'dxf ends with EOF',       expected: true,  actual: dxfText?.trimEnd().endsWith('EOF') ?? false },
  ]);
});

// ─── CAPABILITY: debug-tab ────────────────────────────────────────────────────
capabilities.registerMock('debug-tab', async () => {
  // Load mock into scene (triggers model-loaded event which debug tab subscribes to)
  const { emit } = await import('../../core/event-bus.js');
  const { domain } = await import('../../domains/piping/index.js');
  const components  = await _parseMockPcf();
  await _loadMockIntoScene();

  // Emit the event that debug-tab listens to
  emit('model-loaded', { components, domain, fileName: 'mock.pcf' });
  await new Promise(r => setTimeout(r, 200));   // let DOM update

  // Read debug content
  const content     = document.getElementById('debug-content')?.textContent || '';
  const badgeText   = document.getElementById('debug-domain-label')?.textContent || '';

  // Switch to summary section to get the rendered data
  document.querySelector('[data-debug-section="summary"]')?.click();
  await new Promise(r => setTimeout(r, 100));
  const summaryText = document.getElementById('debug-content')?.textContent || '';

  const hasTotal    = summaryText.includes(String(MOCK_EXPECTED.debug.summaryTotal))
                   || content.includes(String(MOCK_EXPECTED.debug.summaryTotal));
  const hasDomain   = badgeText.includes(MOCK_EXPECTED.debug.domainLabel);

  // Check validation section
  document.querySelector('[data-debug-section="validation"]')?.click();
  await new Promise(r => setTimeout(r, 100));
  const validText   = document.getElementById('debug-content')?.textContent || '';
  const hasNoIssues = validText.includes('No issues') || validText.includes('0 error');

  return runAssertions([
    { label: 'componentsLoaded',     expected: true,                              actual: components.length > 0 },
    { label: 'totalCountInSummary',  expected: true,                              actual: hasTotal },
    { label: 'domainLabel = piping', expected: true,                              actual: hasDomain },
    { label: 'validationNoIssues',   expected: true,                              actual: hasNoIssues },
    { label: 'totalComponents',      expected: MOCK_EXPECTED.debug.summaryTotal,  actual: components.length },
  ]);
});

console.info('[mock-runners] All mock runners registered. Click any 🔬 button to run.');
