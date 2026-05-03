import { formatMm, formatPt, formatProvenanceLabel } from './hud-format.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Width and label per mode for smart sizing
const MODE_META = {
  'line-draw':        { width: '252px', label: 'LINE DRAW' },
  'insert-component': { width: '268px', label: 'INSERT' },
  'polyline-draw':    { width: '228px', label: 'POLYLINE' },
  'spline-draw':      { width: '228px', label: 'SPLINE' },
  'modify-tool':      { width: '224px', label: 'MODIFY' },
  'idle':             { width: '216px', label: 'HUD' },
};

function topbarHtml(state) {
  const mode = state.mode || 'idle';
  const ins = state.insertContext?.component;
  const tool = state.activeTool;

  const btn = (action, icon, label, active) =>
    `<button data-action="${action}" class="hud-mode${active ? ' active' : ''}" title="${label}">${icon}</button>`;

  return `
    <div class="hud-topbar">
      <span class="hud-mode-label">${esc(MODE_META[mode]?.label || 'HUD')}</span>
      <span class="hud-spacer"></span>
      <span class="hud-drag-handle" title="Drag HUD">::</span>
      <button data-action="hide" class="hud-hide" title="Close HUD">x</button>
    </div>
    <div class="hud-topbar-tools">
      ${btn('line',           'L',  'Line draw',        mode === 'line-draw')}
      ${btn('polyline',       'PL', 'Polyline draw',    mode === 'polyline-draw')}
      ${btn('spline',         'SP', 'Spline guide',     mode === 'spline-draw')}
      ${btn('insert-valve',   'V',  'Valve',            mode === 'insert-component' && ins === 'VALVE')}
      ${btn('insert-flange',  'F',  'Flange',           mode === 'insert-component' && ins === 'FLANGE')}
      ${btn('insert-elbow',   'E',  'Elbow',            mode === 'insert-component' && ins === 'ELBOW')}
      ${btn('insert-tee',     'T',  'Tee',              mode === 'insert-component' && ins === 'TEE')}
      ${btn('insert-support', 'S',  'Support',          mode === 'insert-component' && ins === 'SUPPORT')}
      ${btn('modify-move',    'M',  'Move node',        mode === 'modify-tool' && tool === 'MOVE')}
      ${btn('modify-stretch', 'ST', 'Stretch node',     mode === 'modify-tool' && tool === 'STRETCH')}
      ${btn('modify-rotate',  'R',  'Rotate',           mode === 'modify-tool' && tool === 'ROTATE')}
      ${btn('modify-break',   'B',  'Break segment',    mode === 'modify-tool' && tool === 'BREAK')}
      ${btn('modify-delete',  'D',  'Delete',           mode === 'modify-tool' && tool === 'DELETE')}
      ${btn('auto-bend',      'AB', 'Convert Bend',     false)}
      ${btn('auto-tee',       'AT', 'Convert Tee',      false)}
    </div>`;
}
function lineDraftHtml(state) {
  const draft = state.draft || {};
  return `
    <div class="hud-body">
      <div class="hud-row hud-meta">
        <span class="hud-chip">Route: ${esc(draft.routeId || 'new')}</span>
        <span class="hud-chip">Anchor: ${esc(formatPt(draft.anchorPoint))}</span>
      </div>
      <div class="hud-row hud-axis-row">
        <button data-action="axis" data-axis="X" class="hud-mini ${draft.axis === 'X' ? 'active' : ''}">X</button>
        <button data-action="axis" data-axis="Y" class="hud-mini ${draft.axis === 'Y' ? 'active' : ''}">Y</button>
        <button data-action="axis" data-axis="Z" class="hud-mini ${draft.axis === 'Z' ? 'active' : ''}">Z</button>
        <button data-action="sign" data-sign="1"  class="hud-mini ${draft.sign >= 0 ? 'active' : ''}">+</button>
        <button data-action="sign" data-sign="-1" class="hud-mini ${draft.sign < 0 ? 'active' : ''}">âˆ’</button>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Length <input data-field="lengthMm" type="number" min="1" step="1" value="${esc(draft.lengthMm || '')}" /></label>
        <label>Axis   <input data-field="axis"     type="text"   maxlength="1"     value="${esc(draft.axis || 'X')}" /></label>
      </div>
      <div class="hud-row hud-meta">
        <span class="hud-chip">Last: ${esc(formatMm(state.lastLengthMm))}</span>
        <span class="hud-chip">Next: ${esc(formatPt(draft.previewPoint))}</span>
      </div>
      <div class="hud-row hud-actions-row">
        <button data-action="commit-line" class="hud-primary">â†µ Commit</button>
        <button data-action="rise"   class="hud-mini">â†‘ Rise</button>
        <button data-action="drop"   class="hud-mini">â†“ Drop</button>
        <button data-action="cancel" class="hud-mini">Esc</button>
      </div>
      <div class="hud-settings-row">
        <label><input type="checkbox" data-action="toggle-compact" ${state.isCompact ? 'checked' : ''} /> Compact</label>
        <label>Opacity <input type="range" data-action="change-opacity" min="0.2" max="1" step="0.1" value="${state.opacity ?? 1}" /></label>
      </div>
    </div>`;
}

function insertDraftHtml(state) {
  const ctx = state.insertContext || {};
  const warnings = (ctx.warnings || []).length
    ? `<div class="hud-row hud-meta"><span class="hud-chip hud-warning">${esc((ctx.warnings || []).join(', '))}</span></div>`
    : '';
  const alternatives = (ctx.alternatives || []).length
    ? `<div class="hud-row hud-meta"><span class="hud-chip">Alt: ${esc((ctx.alternatives || []).map((row) => [row.subtype || row.component, row.size || '', row.rating || ''].filter(Boolean).join(' ')).join(' | '))}</span></div>`
    : '';
  return `
    <div class="hud-body">
      <div class="hud-row hud-meta">
        <span class="hud-chip">At: ${esc(formatPt(ctx.point))}</span>
        <span class="hud-chip hud-provenance">${esc(formatProvenanceLabel(ctx.provenance))}</span>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Type
          <select data-field="component">
            ${['VALVE','FLANGE','ELBOW','TEE','REDUCER','SUPPORT'].map((name) =>
              `<option value="${name}" ${ctx.component === name ? 'selected' : ''}>${name}</option>`
            ).join('')}
          </select>
        </label>
        <label>Subtype <input data-field="subtype" type="text" value="${esc(ctx.subtype || '')}" /></label>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Size   <input data-field="size"    type="text" value="${esc(ctx.size || '')}" /></label>
        <label>Rating <input data-field="rating"  type="text" value="${esc(ctx.rating || '')}" /></label>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Facing  <input data-field="facing"  type="text" value="${esc(ctx.facing || '')}" /></label>
        <label>EndType <input data-field="endType" type="text" value="${esc(ctx.endType || '')}" /></label>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Length <input data-field="length" type="text" value="${esc(ctx.length || '')}" /></label>
        <label>Weight <input data-field="weight" type="text" value="${esc(ctx.weight || '')}" /></label>
      </div>
      <div class="hud-row hud-meta">
        <span class="hud-chip">Pipeline: ${esc(ctx.pipelineRef || 'â€”')}</span>
        <span class="hud-chip">Match: ${esc(ctx.resolvedMatchKey || 'â€”')}</span>
      </div>
      ${warnings}${alternatives}
      <div class="hud-row hud-actions-row">
        <button data-action="commit-insert" class="hud-primary">â†µ Insert</button>
        <button data-action="cancel" class="hud-mini">Esc</button>
      </div>
      <div class="hud-settings-row">
        <label><input type="checkbox" data-action="toggle-compact" ${state.isCompact ? 'checked' : ''} /> Compact</label>
        <label>Opacity <input type="range" data-action="change-opacity" min="0.2" max="1" step="0.1" value="${state.opacity ?? 1}" /></label>
      </div>
    </div>`;
}

function polylineDraftHtml(state) {
  const pts = state.draftPoints || [];
  const preview = state.currentPreviewPoint;
  return `
    <div class="hud-body hud-compact">
      <div class="hud-row hud-meta">
        <span class="hud-chip">Points: ${pts.length}</span>
        ${preview ? `<span class="hud-chip">Cursor: ${esc(formatPt(preview))}</span>` : ''}
      </div>
      <div class="hud-row hud-meta" style="font-size:11px;color:#94a3b8;">
        Click to add points Â· Double-click to finish
      </div>
      <div class="hud-row hud-actions-row">
        <button data-action="cancel" class="hud-mini">Esc / Cancel</button>
      </div>
    </div>`;
}

function splineDraftHtml(state) {
  const pts = state.draftPoints || [];
  const preview = state.currentPreviewPoint;
  return `
    <div class="hud-body hud-compact">
      <div class="hud-row hud-meta">
        <span class="hud-chip">Control pts: ${pts.length}</span>
        ${preview ? `<span class="hud-chip">Cursor: ${esc(formatPt(preview))}</span>` : ''}
      </div>
      <div class="hud-row hud-meta" style="font-size:11px;color:#94a3b8;">
        Click to add control points Â· Double-click to finish spline
      </div>
      <div class="hud-row hud-actions-row">
        <button data-action="cancel" class="hud-mini">Esc / Cancel</button>
      </div>
    </div>`;
}

const MODIFY_HINTS = {
  MOVE:    'Click node to pick â†’ click target to move',
  STRETCH: 'Click node to pick â†’ click target to stretch',
  ROTATE:  'Click pivot point â†’ click to set rotation angle',
  BREAK:   'Click a pipe segment to insert a break point',
  DELETE:  'Click component or segment to delete',
};

function modifyToolHtml(state) {
  const tool = state.activeTool || '';
  const draft = state.modifyDraft;
  const hint = MODIFY_HINTS[tool] || 'Click a component';
  return `
    <div class="hud-body hud-compact">
      <div class="hud-row hud-meta">
        <span class="hud-chip hud-active-tool">${esc(tool)}</span>
        ${draft ? '<span class="hud-chip hud-warning">Base picked â€” click target</span>' : ''}
      </div>
      <div class="hud-row hud-meta" style="font-size:11px;color:#94a3b8;">${esc(hint)}</div>
      <div class="hud-row hud-actions-row">
        <button data-action="cancel" class="hud-mini">Esc / Cancel</button>
      </div>
    </div>`;
}

export function createHudOverlay(container, handlers = {}) {
  const root = document.createElement('section');
  root.className = 'hud-overlay';
  root.innerHTML = '';
  root.style.left = '72px';
  root.style.top = '70px';
  root.style.right = 'auto';
  root.style.bottom = 'auto';
  container.appendChild(root);

  let drag = null;
  const onPointerMove = (ev) => {
    if (!drag) return;
    const x = ev.clientX - drag.offsetX;
    const y = ev.clientY - drag.offsetY;
    root.style.left = `${Math.max(8, x)}px`;
    root.style.top = `${Math.max(8, y)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  };
  const onPointerUp = () => { drag = null; };
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);

  root.addEventListener('pointerdown', (ev) => {
    const handle = ev.target?.closest?.('.hud-drag-handle');
    if (!handle) return;
    const rect = root.getBoundingClientRect();
    drag = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
  });

  root.addEventListener('click', (ev) => {
    const actionEl = ev.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    // Mode switches
    if (action === 'open')           return handlers.open?.();
    if (action === 'line')           return handlers.activateLine?.();
    if (action === 'polyline')       return handlers.activatePolyline?.();
    if (action === 'spline')         return handlers.activateSpline?.();
    if (action === 'insert-valve')   return handlers.activateInsert?.('VALVE');
    if (action === 'insert-flange')  return handlers.activateInsert?.('FLANGE');
    if (action === 'insert-elbow')   return handlers.activateInsert?.('ELBOW');
    if (action === 'insert-tee')     return handlers.activateInsert?.('TEE');
    if (action === 'insert-support') return handlers.activateInsert?.('SUPPORT');
    if (action === 'modify-move')    return handlers.activateModifyTool?.('MOVE');
    if (action === 'modify-stretch') return handlers.activateModifyTool?.('STRETCH');
    if (action === 'modify-rotate')  return handlers.activateModifyTool?.('ROTATE');
    if (action === 'modify-break')   return handlers.activateModifyTool?.('BREAK');
    if (action === 'modify-delete')  return handlers.activateModifyTool?.('DELETE');

    // Workflow actions
    if (action === 'auto-bend')      return handlers.commitAutoBend?.();
    if (action === 'auto-tee')       return handlers.commitAutoTee?.();
    if (action === 'cancel')         return handlers.cancel?.();
    if (action === 'hide')           return handlers.hide?.();
    if (action === 'axis')           return handlers.setAxis?.(actionEl.dataset.axis);
    if (action === 'sign')           return handlers.setSign?.(Number(actionEl.dataset.sign || 1));
    if (action === 'commit-line')    return handlers.commitLine?.();
    if (action === 'commit-insert')  return handlers.commitInsert?.();
    if (action === 'rise')           return handlers.commitRise?.();
    if (action === 'drop')           return handlers.commitDrop?.();
    if (action === 'toggle-compact') return handlers.toggleCompact?.(ev.target.checked);
  });

  root.addEventListener('change', (ev) => {
    if (ev.target.closest('[data-action="change-opacity"]')) handlers.changeOpacity?.(ev.target.value);
    if (ev.target.closest('[data-action="toggle-compact"]')) handlers.toggleCompact?.(ev.target.checked);
  });

  root.addEventListener('input', (ev) => {
    const field = ev.target?.dataset?.field;
    if (field) handlers.updateField?.(field, ev.target.value);
  });

  function render(state) {
    const mode = state.mode || 'idle';
    const visible = state.visible !== false;
    root.classList.toggle('is-hidden', !visible);
    root.classList.toggle('is-active', visible && mode !== 'idle');
    root.classList.toggle('hud-compact', Boolean(state.isCompact));

    if (!visible) {
      root.innerHTML = `<button class="hud-open-btn" data-action="open">HUD</button>`;
      root.style.width = '';
      return;
    }

    // Smart width based on active mode
    root.style.width = MODE_META[mode]?.width || '216px';
    // Opacity
    root.style.opacity = String(state.opacity ?? 1);

    const errors = (state.errors || []).length
      ? `<div class="hud-errors">${(state.errors || []).map((msg) => `<div>${esc(msg)}</div>`).join('')}</div>`
      : '';

    let body = topbarHtml(state);

    // Compact mode hides the hints bar
    if (!state.isCompact) {
      body += '<div class="hud-hints">L line · PL polyline · SP spline · V/F/E/T/S insert · Shift+B bend · Shift+T tee · Enter commit · Esc cancel</div>';
    }

    if (mode === 'line-draw')         body += lineDraftHtml(state);
    else if (mode === 'insert-component') body += insertDraftHtml(state);
    else if (mode === 'polyline-draw') body += polylineDraftHtml(state);
    else if (mode === 'spline-draw')   body += splineDraftHtml(state);
    else if (mode === 'modify-tool')   body += modifyToolHtml(state);
    else body += `<div class="hud-body hud-idle">Select a tool above or use keyboard shortcuts.</div>`;

    body += errors;
    root.innerHTML = body;
  }

  return {
    root,
    render,
    destroy() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      root.remove();
    },
  };
}

