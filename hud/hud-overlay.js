import { formatMm, formatPt, formatProvenanceLabel } from './hud-format.js';
import { polylineSegmentTableRows } from './hud-polyline-professional.js';
import { splinePointTableRows } from './hud-spline-professional.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* ── Per-mode colour, title, icon ── */
const TOOL_COLOR = {
  'line-draw':        '#3b82f6',
  'polyline-draw':    '#3b82f6',
  'spline-draw':      '#3b82f6',
  'circle-draw':      '#10b981',
  'arc-draw':         '#f97316',
  'insert-component': '#a78bfa',
  'modify-tool':      '#f59e0b',
  'idle':             '#64748b',
};

const TOOL_TITLE = {
  'line-draw':        'LINE DRAW',
  'polyline-draw':    'POLYLINE',
  'spline-draw':      'SPLINE GUIDE',
  'circle-draw':      'CIRCLE',
  'arc-draw':         'ARC DRAW',
  'insert-component': 'INSERT',
  'modify-tool':      'MODIFY',
  'idle':             'HUD',
};

const INSERT_TITLE  = { VALVE:'VALVE', FLANGE:'FLANGE', ELBOW:'ELBOW', TEE:'TEE', REDUCER:'REDUCER', SUPPORT:'SUPPORT' };
const MODIFY_TITLE  = { MOVE:'MOVE', STRETCH:'STRETCH', ROTATE:'ROTATE', BREAK:'BREAK', DELETE:'DELETE' };

/* Unicode stand-ins for SVG icons */
const TOOL_ICON = {
  'line-draw':        '╱',
  'polyline-draw':    '⌇',
  'spline-draw':      '∿',
  'circle-draw':      '○',
  'arc-draw':         '⌒',
  'insert-component': '⊕',
  'modify-tool':      '⟐',
  'idle':             '◈',
};
const INSERT_ICON  = { VALVE:'⊗', FLANGE:'⊞', ELBOW:'⌐', TEE:'⊤', REDUCER:'⊳', SUPPORT:'⊥' };
const MODIFY_ICON  = { MOVE:'✛', STRETCH:'↔', ROTATE:'↻', BREAK:'✂', DELETE:'✕' };

/* ── Header ── */
function headerHtml(state) {
  const mode = state.mode || 'idle';
  const ac   = TOOL_COLOR[mode] || '#64748b';
  const ins  = state.insertContext?.component;
  const tool = state.activeTool;

  let title = TOOL_TITLE[mode] || 'HUD';
  let icon  = TOOL_ICON[mode]  || '◈';
  if (mode === 'insert-component' && ins) { title = INSERT_TITLE[ins] || ins; icon = INSERT_ICON[ins] || icon; }
  if (mode === 'modify-tool'      && tool){ title = MODIFY_TITLE[tool] || tool; icon = MODIFY_ICON[tool] || icon; }

  return `
    <div class="hud-header" data-drag style="border-bottom:1px solid ${ac}30;background:${ac}14;">
      <span class="hud-header-icon" style="color:${ac}">${esc(icon)}</span>
      <span class="hud-header-title" style="color:${ac}">${esc(title)}</span>
      <span class="hud-drag-handle" title="Drag HUD">::</span>
      <button data-action="hide" class="hud-hide" title="Close">×</button>
    </div>`;
}

/* ── Field row builder ── */
function fieldRow(fields) {
  const cells = fields.map(f => {
    let ctrl;
    if (f.type === 'seg') {
      ctrl = `<div class="hud-seg-group">${f.opts.map(o =>
        `<button class="hud-seg-btn${o === f.val ? ' active' : ''}" data-action="seg-${esc(f.id)}" data-val="${esc(o)}">${esc(o)}</button>`
      ).join('')}</div>`;
    } else if (f.type === 'select') {
      ctrl = `<select class="hud-field-input" data-field="${esc(f.id)}">${f.opts.map(o =>
        `<option${o === f.val ? ' selected' : ''}>${esc(o)}</option>`
      ).join('')}</select>`;
    } else if (f.type === 'badge') {
      ctrl = `<div class="hud-field-badge">${esc(f.val)}</div>`;
    } else {
      ctrl = `<input class="hud-field-input" data-field="${esc(f.id)}" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(f.val || '')}" />`;
    }
    return `<div class="hud-field-cell" style="flex:${f.flex || 1}">
      <div class="hud-field-label">${esc(f.label.toUpperCase())}</div>
      ${ctrl}
    </div>`;
  });
  return `<div class="hud-field-row">${cells.join('')}</div>`;
}

/* ── Info strip (2-col grid, pairs: key, value, key, value …) ── */
function infoStrip(pairs) {
  if (!pairs.length) return '';
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push(`<span class="hud-info-key">${esc(pairs[i])}</span><span class="hud-info-val">${esc(pairs[i + 1] ?? '')}</span>`);
  }
  return `<div class="hud-info-strip">${rows.join('')}</div>`;
}

function segmentTable(rows) {
  if (!rows.length) {
    return `<div class="hud-segment-empty">No segments yet</div>`;
  }

  return `<div class="hud-segment-table">
    <div class="hud-segment-head">
      <span>#</span><span>Len</span><span>Axis</span><span>Token</span>
    </div>
    ${rows.slice(-6).map((row) => `
      <div class="hud-segment-row">
        <span>${esc(row.index)}</span>
        <span>${esc(row.length)}</span>
        <span>${esc(row.axis)}</span>
        <span title="${esc(row.token)}">${esc(row.token)}</span>
      </div>
    `).join('')}
  </div>`;
}

function pointTable(rows) {
  if (!rows.length) {
    return `<div class="hud-segment-empty">No control points yet</div>`;
  }

  return `<div class="hud-segment-table">
    <div class="hud-segment-head">
      <span>#</span><span>X</span><span>Y</span><span>Z</span>
    </div>
    ${rows.slice(-8).map((row) => `
      <div class="hud-segment-row">
        <span>${esc(row.index)}</span>
        <span>${esc(row.x)}</span>
        <span>${esc(row.y)}</span>
        <span>${esc(row.z)}</span>
      </div>
    `).join('')}
  </div>`;
}

/* ── Actions bar ── */
function actionsBar(actions, ac) {
  return `<div class="hud-actions-bar">${actions.map(a => {
    let bg, bdr, clr;
    if (a.primary) {
      bg = ac; bdr = ac; clr = '#0d1117';
    } else if (a.danger) {
      bg = 'rgba(239,68,68,0.15)'; bdr = 'rgba(239,68,68,0.5)'; clr = '#ef4444';
    } else {
      bg = 'var(--bg-3)'; bdr = 'var(--steel)'; clr = 'var(--text-secondary)';
    }
    return `<button class="hud-action-btn" data-action="${esc(a.action)}"
      style="background:${bg};border-color:${bdr};color:${clr}">${esc(a.label)}</button>`;
  }).join('')}</div>`;
}

/* ═══════════════ Mode bodies ═══════════════ */

function lineDraftHtml(state) {
  const draft   = state.draft || {};
  const ac      = TOOL_COLOR['line-draw'];
  const waiting = state.awaitingAnchorClick || !draft.anchorPoint;

  /* While waiting for a canvas click, show a prompt instead of full fields */
  if (waiting) {
    return [
      infoStrip(['Start', 'Click canvas to set start point']),
      actionsBar([
        { label:'Esc', action:'cancel', danger:true },
      ], ac),
    ].join('');
  }

  return [
    '<div class="hud-fields-section">',
    fieldRow([
      { id:'axis', label:'Axis', type:'seg', opts:['X','Y','Z'], val: draft.axis || 'X', flex:1 },
      { id:'sign', label:'Dir',  type:'seg', opts:['+','−'],    val: (draft.sign >= 0 ? '+' : '−'), flex:1 },
    ]),
    fieldRow([
      { id:'lengthMm', label:'Length mm', type:'number', val: String(draft.lengthMm || ''), flex:2 },
      { id:'routeId',  label:'Pipeline',  type:'text',   val: draft.routeId || 'new', flex:3 },
    ]),
    fieldRow([
      { id:'commandText', label:'Input', type:'text', val: draft.commandText || '', flex:1 },
    ]),
    '</div>',
    infoStrip([
      'Mode',    draft.inputMode || draft.lastParsed?.mode || 'Length',
      'Anchor',  formatPt(draft.anchorPoint),
      'Preview', formatPt(draft.previewPoint),
      'Last',    formatMm(state.lastLengthMm),
    ]),
    actionsBar([
      { label:'↵ Commit', action:'commit-line', primary:true },
      { label:'Repeat',   action:'repeat-line' },
      { label:'↑ Rise',   action:'rise' },
      { label:'↓ Drop',   action:'drop' },
      { label:'Esc',      action:'cancel', danger:true },
    ], ac),
  ].join('');
}

function insertDraftHtml(state) {
  const ctx  = state.insertContext || {};
  const ac   = TOOL_COLOR['insert-component'];
  const comp = ctx.component || 'VALVE';

  /* If no insertion point set yet, prompt user to click canvas */
  if (!ctx.point) {
    return [
      infoStrip(['At', 'Click canvas to place ' + comp]),
      actionsBar([{ label:'Esc', action:'cancel', danger:true }], ac),
    ].join('');
  }

  let rows = '';
  if (comp === 'VALVE') {
    rows = [
      fieldRow([
        { id:'subtype', label:'Type',   type:'select', opts:['Gate','Ball','Check','Butterfly','Globe'], val: ctx.subtype || 'Gate', flex:2 },
        { id:'rating',  label:'Rating', type:'text',   val: ctx.rating || 'PN16', flex:1 },
      ]),
      fieldRow([
        { id:'size',   label:'OD',     type:'text', val: ctx.size   || '', flex:1 },
        { id:'facing', label:'Facing', type:'select', opts:['FW','RTJ','RF'], val: ctx.facing || 'FW', flex:1 },
      ]),
    ].join('');
  } else if (comp === 'FLANGE') {
    rows = [
      fieldRow([
        { id:'subtype', label:'Type',   type:'select', opts:['Weld Neck','Slip-on','Blind','SW'], val: ctx.subtype || 'Weld Neck', flex:2 },
        { id:'rating',  label:'Rating', type:'text',   val: ctx.rating || 'PN16', flex:1 },
      ]),
      fieldRow([
        { id:'size',    label:'OD',  type:'text', val: ctx.size    || '', flex:1 },
        { id:'endType', label:'Std', type:'text', val: ctx.endType || 'B16.5', flex:1 },
      ]),
    ].join('');
  } else if (comp === 'TEE') {
    rows = [
      fieldRow([
        { id:'size',    label:'Header OD', type:'text', val: ctx.size    || '', flex:1 },
        { id:'subtype', label:'Branch OD', type:'text', val: ctx.subtype || '', flex:1 },
      ]),
      fieldRow([
        { id:'rating', label:'Rating', type:'text', val: ctx.rating || 'PN16', flex:1 },
        { id:'facing', label:'Branch', type:'seg', opts:['Z+','Z−','Y+','Y−'], val: ctx.facing || 'Z+', flex:2 },
      ]),
    ].join('');
  } else if (comp === 'ELBOW') {
    rows = [
      fieldRow([
        { id:'subtype', label:'Angle',  type:'select', opts:['90°','45°','22.5°'], val: ctx.subtype || '90°', flex:1 },
        { id:'facing',  label:'Radius', type:'select', opts:['LR','SR'],           val: ctx.facing  || 'LR',  flex:1 },
      ]),
      fieldRow([
        { id:'size', label:'OD', type:'text', val: ctx.size || '', flex:1 },
      ]),
    ].join('');
  } else if (comp === 'SUPPORT') {
    rows = fieldRow([
      { id:'subtype', label:'Type', type:'select', opts:['U-bolt','Shoe','Dummy Leg','Trunnion'], val: ctx.subtype || 'U-bolt', flex:2 },
      { id:'size',    label:'OD',   type:'text',   val: ctx.size || '', flex:1 },
    ]);
  } else if (comp === 'REDUCER') {
    rows = [
      fieldRow([
        { id:'size',    label:'From OD', type:'text', val: ctx.size    || '', flex:1 },
        { id:'subtype', label:'To OD',   type:'text', val: ctx.subtype || '', flex:1 },
      ]),
      fieldRow([
        { id:'facing', label:'Type', type:'select', opts:['Concentric','Eccentric'], val: ctx.facing || 'Concentric', flex:1 },
      ]),
    ].join('');
  } else {
    rows = fieldRow([
      { id:'size',   label:'OD',     type:'text', val: ctx.size   || '', flex:1 },
      { id:'rating', label:'Rating', type:'text', val: ctx.rating || '', flex:1 },
    ]);
  }

  const warnHtml = (ctx.warnings || []).length
    ? `<div class="hud-warn-row">${esc((ctx.warnings || []).join(', '))}</div>`
    : '';

  return [
    `<div class="hud-fields-section">${rows}</div>`,
    infoStrip([
      'At',    formatPt(ctx.point),
      'Match', ctx.resolvedMatchKey || '—',
      'Prov.', formatProvenanceLabel(ctx.provenance),
    ]),
    warnHtml,
    actionsBar([
      { label:'↵ Insert', action:'commit-insert', primary:true },
      { label:'Esc',      action:'cancel', danger:true },
    ], ac),
  ].join('');
}

function polylineDraftHtml(state) {
  const draft = state.draft || {};
  const pts = draft.points || state.draftPoints || [];
  const rows = polylineSegmentTableRows(draft);
  const ac = TOOL_COLOR['polyline-draw'];
  const waiting = !draft.currentPoint;

  if (waiting) {
    return [
      infoStrip(['Start', 'Click canvas to set first point']),
      actionsBar([
        { label:'Esc', action:'cancel', danger:true },
      ], ac),
    ].join('');
  }

  return [
    '<div class="hud-fields-section">',
    fieldRow([
      { id:'axis', label:'Axis', type:'seg', opts:['X','Y','Z'], val: draft.axis || 'X', flex:1 },
      { id:'sign', label:'Dir',  type:'seg', opts:['+','−'],    val: (draft.sign >= 0 ? '+' : '−'), flex:1 },
    ]),
    fieldRow([
      { id:'lengthMm', label:'Length mm', type:'number', val: String(draft.lengthMm || ''), flex:2 },
      { id:'routeId',  label:'Pipeline',  type:'text',   val: draft.routeId || 'new', flex:3 },
    ]),
    fieldRow([
      { id:'commandText', label:'Input', type:'text', val: draft.commandText || '', flex:1 },
    ]),
    '</div>',
    infoStrip([
      'Pts', String(pts.length),
      'Seg', String(rows.length),
      'Current', formatPt(draft.currentPoint),
      'Preview', formatPt(draft.previewPoint),
    ]),
    segmentTable(rows),
    actionsBar([
      { label:'Add',    action:'poly-add', primary:true },
      { label:'Undo',   action:'poly-undo' },
      { label:'Close',  action:'poly-close' },
      { label:'Finish', action:'poly-finish', primary:true },
      { label:'Esc',    action:'cancel', danger:true },
    ], ac),
  ].join('');
}

function splineDraftHtml(state) {
  const draft = state.draft || {};
  const pts = draft.points || state.draftPoints || [];
  const rows = splinePointTableRows(draft);
  const ac  = TOOL_COLOR['spline-draw'];
  const waiting = !draft.currentPoint;

  if (waiting) {
    return [
      infoStrip(['Start', 'Click canvas to set first control point']),
      actionsBar([
        { label:'Esc', action:'cancel', danger:true },
      ], ac),
    ].join('');
  }

  return [
    '<div class="hud-fields-section">',
    fieldRow([
      { id:'axis', label:'Axis', type:'seg', opts:['X','Y','Z'], val: draft.axis || 'X', flex:1 },
      { id:'sign', label:'Dir',  type:'seg', opts:['+','−'],    val: (draft.sign >= 0 ? '+' : '−'), flex:1 },
    ]),
    fieldRow([
      { id:'lengthMm', label:'Length mm', type:'number', val: String(draft.lengthMm || ''), flex:2 },
      { id:'pipelineRef', label:'Guide Ref', type:'text', val: draft.pipelineRef || '', flex:3 },
    ]),
    fieldRow([
      { id:'commandText', label:'Input', type:'text', val: draft.commandText || '', flex:1 },
    ]),
    '</div>',
    infoStrip([
      'Pts', String(pts.length),
      'Current', formatPt(draft.currentPoint),
      'Preview', formatPt(draft.previewPoint),
      'Type', 'SPLINE guide',
    ]),
    pointTable(rows),
    actionsBar([
      { label:'Add',    action:'spline-add', primary:true },
      { label:'Undo',   action:'spline-undo' },
      { label:'Clear',  action:'spline-clear' },
      { label:'Finish', action:'spline-finish', primary:true },
      { label:'Esc',    action:'cancel', danger:true },
    ], ac),
  ].join('');
}

function circleDraftHtml(state) {
  const pts = state.draftPoints || [];
  const ac  = TOOL_COLOR['circle-draw'];
  const step = pts.length === 0 ? 'Click canvas to set center' : 'Click to set radius point';
  const stepNum = pts.length === 0 ? '1 / 2' : '2 / 2';
  return [
    '<div class="hud-fields-section">',
    fieldRow([
      { id:'step', label:'Step', type:'badge', val: stepNum, flex:1 },
    ]),
    '</div>',
    infoStrip(['Action', step, 'Center', pts[0] ? `${Math.round(pts[0].x)}, ${Math.round(pts[0].y)}` : '—']),
    actionsBar([
      { label:'Esc', action:'cancel', danger:true },
    ], ac),
  ].join('');
}

function arcDraftHtml(state) {
  const pts = state.draftPoints || [];
  const ac  = TOOL_COLOR['arc-draw'];
  let step, info;
  if (pts.length === 0) {
    step = '1 / 3'; info = ['Action', 'Click to set arc center'];
  } else if (pts.length === 1) {
    step = '2 / 3'; info = ['Action', 'Click to set start point (radius)', 'Center', `${Math.round(pts[0].x)}, ${Math.round(pts[0].y)}`];
  } else {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dz = pts[1].z - pts[0].z;
    const r  = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
    step = '3 / 3'; info = ['Action', 'Click to set end point', 'Radius', `${r} mm`];
  }
  return [
    '<div class="hud-fields-section">',
    fieldRow([
      { id:'step', label:'Step', type:'badge', val: step, flex:1 },
    ]),
    '</div>',
    infoStrip(info),
    actionsBar([
      { label:'Esc', action:'cancel', danger:true },
    ], ac),
  ].join('');
}

const MODIFY_HINTS = {
  MOVE:    ['Click','base node','Then','target'],
  STRETCH: ['Click','end node','Drag','new pos.'],
  ROTATE:  ['Click','pivot'],
  BREAK:   ['Click','segment midpoint'],
  DELETE:  ['Click','to select'],
};

function modifyToolHtml(state) {
  const tool  = state.activeTool || '';
  const draft = state.modifyDraft;
  const ac    = TOOL_COLOR['modify-tool'];
  const hints = MODIFY_HINTS[tool] || [];
  const infoPairs = [...hints];
  if (draft) infoPairs.push('Status', 'Base picked — click target');

  let extraFields = '';
  if (tool === 'ROTATE') {
    extraFields = `<div class="hud-fields-section">${fieldRow([
      { id:'angle',  label:'Angle', type:'text', val:'90°', flex:1 },
      { id:'around', label:'Axis',  type:'seg', opts:['X','Y','Z'], val:'Z', flex:1 },
    ])}</div>`;
  } else if (tool === 'MOVE' || tool === 'STRETCH') {
    extraFields = `<div class="hud-fields-section">${fieldRow([
      { id:'snap', label:'Snap', type:'text', val:'250 mm', flex:1 },
    ])}</div>`;
  }

  const actions = (tool === 'ROTATE')
    ? [{ label:'↵ Apply', action:'modify-apply', primary:true }, { label:'Esc', action:'cancel', danger:true }]
    : (tool === 'DELETE')
    ? [{ label:'↵ Confirm', action:'modify-apply', primary:true, danger:false }, { label:'Esc', action:'cancel' }]
    : [{ label:'Esc', action:'cancel', danger:true }];

  return [
    extraFields,
    infoStrip(infoPairs),
    actionsBar(actions, ac),
  ].join('');
}

/* ═══════════════ Public factory ═══════════════ */
export function createHudOverlay(container, handlers = {}) {
  const root = document.createElement('section');
  root.className = 'hud-overlay';
  root.style.left = '72px';
  root.style.top  = '70px';
  root.style.right  = 'auto';
  root.style.bottom = 'auto';
  container.appendChild(root);

  /* ── drag ── */
  let drag = null;
  const onPointerMove = ev => {
    if (!drag) return;
    root.style.left   = `${Math.max(8, ev.clientX - drag.offsetX)}px`;
    root.style.top    = `${Math.max(8, ev.clientY - drag.offsetY)}px`;
    root.style.right  = 'auto';
    root.style.bottom = 'auto';
  };
  const onPointerUp = () => { drag = null; };
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup',   onPointerUp);

  root.addEventListener('pointerdown', ev => {
    if (!ev.target.closest('[data-drag]')) return;
    const r = root.getBoundingClientRect();
    drag = { offsetX: ev.clientX - r.left, offsetY: ev.clientY - r.top };
  });

  /* ── click dispatch ── */
  root.addEventListener('click', ev => {
    const el     = ev.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'hide')          return handlers.hide?.();
    if (action === 'open')          return handlers.open?.();
    if (action === 'cancel')        return handlers.cancel?.();
    if (action === 'commit-line')   return handlers.commitLine?.();
    if (action === 'repeat-line')   return handlers.repeatLine?.();
    if (action === 'poly-add')      return handlers.addPolylineSegment?.();
    if (action === 'poly-undo')     return handlers.undoPolylineSegment?.();
    if (action === 'poly-close')    return handlers.closePolyline?.();
    if (action === 'poly-finish')   return handlers.finishPolyline?.();
    if (action === 'spline-add')    return handlers.addSplinePoint?.();
    if (action === 'spline-undo')   return handlers.undoSplinePoint?.();
    if (action === 'spline-clear')  return handlers.clearSpline?.();
    if (action === 'spline-finish') return handlers.finishSpline?.();
    if (action === 'commit-insert') return handlers.commitInsert?.();
    if (action === 'rise')          return handlers.commitRise?.();
    if (action === 'drop')          return handlers.commitDrop?.();
    if (action === 'modify-apply')  return handlers.commitModify?.();

    /* seg buttons */
    if (action?.startsWith('seg-')) {
      const field = action.slice(4);
      const val   = el.dataset.val;
      if      (field === 'axis') handlers.setAxis?.(val);
      else if (field === 'sign') handlers.setSign?.(val === '+' ? 1 : -1);
      else                       handlers.updateField?.(field, val);
    }
  });

  root.addEventListener('input', ev => {
    const field = ev.target?.dataset?.field;
    if (field) handlers.updateField?.(field, ev.target.value);
  });

  /* ── render ── */
  function render(state) {
    const mode    = state.mode || 'idle';
    const visible = state.visible !== false;
    root.classList.toggle('is-hidden', !visible);
    root.classList.toggle('is-active', visible && mode !== 'idle');

    if (!visible) {
      const ac = TOOL_COLOR[mode] || '#64748b';
      root.innerHTML = `<button class="hud-open-btn" data-action="open"
        style="border-color:${ac}55;color:${ac}">HUD</button>`;
      root.style.width = '';
      return;
    }

    root.style.width   = '216px';
    root.style.opacity = String(state.opacity ?? 1);

    const errors = (state.errors || []).length
      ? `<div class="hud-errors">${state.errors.map(m => `<div>${esc(m)}</div>`).join('')}</div>`
      : '';

    let body = headerHtml(state);

    if      (mode === 'line-draw')         body += lineDraftHtml(state);
    else if (mode === 'insert-component')  body += insertDraftHtml(state);
    else if (mode === 'polyline-draw')     body += polylineDraftHtml(state);
    else if (mode === 'spline-draw')       body += splineDraftHtml(state);
    else if (mode === 'circle-draw')       body += circleDraftHtml(state);
    else if (mode === 'arc-draw')          body += arcDraftHtml(state);
    else if (mode === 'modify-tool')       body += modifyToolHtml(state);
    else body += `<div class="hud-idle-msg">Select a tool to begin.</div>`;

    body += errors;
    root.innerHTML = body;
  }

  return {
    root,
    render,
    destroy() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup',   onPointerUp);
      root.remove();
    },
  };
}
