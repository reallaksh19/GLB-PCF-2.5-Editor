import { MASTERDB_VISIBLE_COLUMNS } from './masterdb-schema.js';
import { toVisibleRow } from './masterdb-normalize.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderMasterDbGrid(container, state, handlers = {}) {
  const filterText = String(state.filterText || '').trim().toLowerCase();
  const filtered = (state.rows || []).filter((row) => {
    if (!filterText) return true;
    return Object.values(toVisibleRow(row)).some((value) => String(value ?? '').toLowerCase().includes(filterText));
  });

  container.innerHTML = `
    <div class="masterdb-toolbar">
      <input class="masterdb-filter" id="masterdb-filter" placeholder="Filter component, size, rating..." value="${esc(state.filterText || '')}">
      <button id="btn-masterdb-add">+ Row</button>
      <button id="btn-masterdb-delete" ${state.selectedId ? '' : 'disabled'}>Delete</button>
      <button id="btn-masterdb-reset">Reset</button>
      <button id="btn-masterdb-export-json">Export JSON</button>
      <button id="btn-masterdb-export-csv">Export CSV</button>
      <button id="btn-masterdb-close">Close</button>
    </div>
    <div class="masterdb-grid-wrap">
      <table class="masterdb-grid">
        <thead>
          <tr>
            ${MASTERDB_VISIBLE_COLUMNS.map((col) => `<th>${esc(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filtered.map((row) => {
            const view = toVisibleRow(row);
            return `<tr data-row-id="${esc(row.id)}" class="${state.selectedId === row.id ? 'active' : ''}">
              ${MASTERDB_VISIBLE_COLUMNS.map((col) => `<td><input data-row-id="${esc(row.id)}" data-col="${esc(col)}" value="${esc(view[col])}"></td>`).join('')}
            </tr>`;
          }).join('') || `<tr><td colspan="${MASTERDB_VISIBLE_COLUMNS.length}">No rows</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="masterdb-footer">
      <span>Rows: ${filtered.length} / ${(state.rows || []).length}</span>
      <span>${state.lastResolution?.matchKey ? `Last match: ${esc(state.lastResolution.matchKey)}` : 'Last match: —'}</span>
      <span>${state.dirty ? 'Unsaved changes' : 'Saved'}</span>
    </div>
  `;

  container.querySelector('#masterdb-filter')?.addEventListener('input', (ev) => handlers.onFilter?.(ev.target.value));
  container.querySelector('#btn-masterdb-add')?.addEventListener('click', () => handlers.onAdd?.());
  container.querySelector('#btn-masterdb-delete')?.addEventListener('click', () => handlers.onDelete?.(state.selectedId));
  container.querySelector('#btn-masterdb-reset')?.addEventListener('click', () => handlers.onReset?.());
  container.querySelector('#btn-masterdb-export-json')?.addEventListener('click', () => handlers.onExportJson?.());
  container.querySelector('#btn-masterdb-export-csv')?.addEventListener('click', () => handlers.onExportCsv?.());
  container.querySelector('#btn-masterdb-close')?.addEventListener('click', () => handlers.onClose?.());

  container.querySelectorAll('tr[data-row-id]').forEach((row) => {
    row.addEventListener('click', () => handlers.onSelect?.(row.dataset.rowId));
  });
  container.querySelectorAll('input[data-row-id][data-col]').forEach((input) => {
    input.addEventListener('input', (ev) => handlers.onEdit?.(ev.target.dataset.rowId, ev.target.dataset.col, ev.target.value));
  });
}
