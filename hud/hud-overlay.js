import { formatMm, formatPt, formatProvenanceLabel } from './hud-format.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
        <button data-action="sign" data-sign="1" class="hud-mini ${draft.sign >= 0 ? 'active' : ''}">+</button>
        <button data-action="sign" data-sign="-1" class="hud-mini ${draft.sign < 0 ? 'active' : ''}">−</button>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Length <input data-field="lengthMm" type="number" min="1" step="1" value="${esc(draft.lengthMm || '')}" /></label>
        <label>Axis <input data-field="axis" type="text" maxlength="1" value="${esc(draft.axis || 'X')}" /></label>
      </div>
      <div class="hud-row hud-meta">
        <span class="hud-chip">Last: ${esc(formatMm(state.lastLengthMm))}</span>
        <span class="hud-chip">Next: ${esc(formatPt(draft.previewPoint))}</span>
      </div>
      <div class="hud-row hud-actions-row">
        <button data-action="commit-line" class="hud-primary">Enter / Commit</button>
        <button data-action="rise" class="hud-mini">Rise</button>
        <button data-action="drop" class="hud-mini">Drop</button>
        <button data-action="cancel" class="hud-mini">Cancel</button>
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
            ${['VALVE','FLANGE','ELBOW','TEE','REDUCER','SUPPORT'].map((name)=>`<option value="${name}" ${ctx.component===name?'selected':''}>${name}</option>`).join('')}
          </select>
        </label>
        <label>Subtype <input data-field="subtype" type="text" value="${esc(ctx.subtype || '')}" /></label>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Size <input data-field="size" type="text" value="${esc(ctx.size || '')}" /></label>
        <label>Rating <input data-field="rating" type="text" value="${esc(ctx.rating || '')}" /></label>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Facing <input data-field="facing" type="text" value="${esc(ctx.facing || '')}" /></label>
        <label>EndType <input data-field="endType" type="text" value="${esc(ctx.endType || '')}" /></label>
      </div>
      <div class="hud-row hud-fields-row">
        <label>Length <input data-field="length" type="text" value="${esc(ctx.length || '')}" /></label>
        <label>Weight <input data-field="weight" type="text" value="${esc(ctx.weight || '')}" /></label>
      </div>
      <div class="hud-row hud-meta">
        <span class="hud-chip">Pipeline: ${esc(ctx.pipelineRef || '—')}</span>
        <span class="hud-chip">Match: ${esc(ctx.resolvedMatchKey || '—')}</span>
      </div>
      ${warnings}
      ${alternatives}
      <div class="hud-row hud-actions-row">
        <button data-action="commit-insert" class="hud-primary">Insert</button>
        <button data-action="cancel" class="hud-mini">Cancel</button>
      </div>
    </div>`;
}

export function createHudOverlay(container, handlers = {}) {
  const root = document.createElement('section');
  root.className = 'hud-overlay';
  root.innerHTML = '';
  container.appendChild(root);

  root.addEventListener('click', (ev) => {
    const actionEl = ev.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'open') return handlers.open?.();
    if (action === 'line') return handlers.activateLine?.();
    if (action === 'insert-valve') return handlers.activateInsert?.('VALVE');
    if (action === 'insert-flange') return handlers.activateInsert?.('FLANGE');
    if (action === 'insert-elbow') return handlers.activateInsert?.('ELBOW');
    if (action === 'insert-tee') return handlers.activateInsert?.('TEE');
    if (action === 'insert-support') return handlers.activateInsert?.('SUPPORT');
    if (action === 'auto-bend') return handlers.commitAutoBend?.();
    if (action === 'auto-tee') return handlers.commitAutoTee?.();
    if (action === 'cancel') return handlers.cancel?.();
    if (action === 'hide') return handlers.hide?.();
    if (action === 'axis') return handlers.setAxis?.(actionEl.dataset.axis);
    if (action === 'sign') return handlers.setSign?.(Number(actionEl.dataset.sign || 1));
    if (action === 'commit-line') return handlers.commitLine?.();
    if (action === 'commit-insert') return handlers.commitInsert?.();
    if (action === 'rise') return handlers.commitRise?.();
    if (action === 'drop') return handlers.commitDrop?.();
  });

  root.addEventListener('input', (ev) => {
    const field = ev.target?.dataset?.field;
    if (!field) return;
    handlers.updateField?.(field, ev.target.value);
  });

  function render(state) {
    const mode = state.mode || 'idle';
    const visible = state.visible !== false;
    root.classList.toggle('is-hidden', !visible);
    root.classList.toggle('is-active', visible && mode !== 'idle');

    if (!visible) {
      root.innerHTML = `<button class="hud-open-btn" data-action="open">HUD</button>`;
      return;
    }

    const errors = (state.errors || []).length
      ? `<div class="hud-errors">${(state.errors || []).map((msg) => `<div>${esc(msg)}</div>`).join('')}</div>`
      : '';

    let body = `
      <div class="hud-topbar">
        <button data-action="line" class="hud-mode ${mode === 'line-draw' ? 'active' : ''}">✏ Line</button>
        <button data-action="insert-valve" class="hud-mode ${mode === 'insert-component' && state.insertContext?.component === 'VALVE' ? 'active' : ''}">⛭ Valve</button>
        <button data-action="insert-flange" class="hud-mode ${mode === 'insert-component' && state.insertContext?.component === 'FLANGE' ? 'active' : ''}">◍ Flange</button>
        <button data-action="insert-elbow" class="hud-mode ${mode === 'insert-component' && state.insertContext?.component === 'ELBOW' ? 'active' : ''}">↱ Elbow</button>
        <button data-action="insert-tee" class="hud-mode ${mode === 'insert-component' && state.insertContext?.component === 'TEE' ? 'active' : ''}">⊢ Tee</button>
        <button data-action="insert-support" class="hud-mode ${mode === 'insert-component' && state.insertContext?.component === 'SUPPORT' ? 'active' : ''}">⌂ Support</button>
        <button data-action="auto-bend" class="hud-mode">↱ Convert Bend</button>
        <button data-action="auto-tee" class="hud-mode">⊣ Convert Tee</button>
        <button data-action="hide" class="hud-hide">×</button>
      </div>
      <div class="hud-hints">L line · V valve · F flange · E elbow · T tee · S support · Shift+B auto bend · Shift+T auto tee · X/Y/Z axis · +/- sign · Enter commit · Esc cancel</div>
    `;

    if (mode === 'line-draw') body += lineDraftHtml(state);
    else if (mode === 'insert-component') body += insertDraftHtml(state);
    else body += `<div class="hud-body hud-idle">HUD ready. Choose a mode or use shortcuts.</div>`;

    body += errors;
    root.innerHTML = body;
  }

  return {
    root,
    render,
    destroy() {
      root.remove();
    },
  };
}
