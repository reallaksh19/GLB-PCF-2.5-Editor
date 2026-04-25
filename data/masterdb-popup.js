import { emit } from '../core/event-bus.js';
import { appLogger } from '../js/debug/logger.js';
import { exportMasterDbCsv, exportMasterDbJson } from './masterdb-import-export.js';
import { renderMasterDbGrid } from './masterdb-grid.js';

function download(name, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function fieldPatchFromVisible(col, value) {
  const map = {
    Component: 'component',
    Subtype: 'subtype',
    Size: 'size',
    Rating: 'rating',
    Schedule: 'schedule',
    EndType: 'endType',
    Facing: 'facing',
    Angle: 'angle',
    RadiusType: 'radiusType',
    CenterToEnd: 'centerToEnd',
    TangentLength: 'tangentLength',
    RunSize: 'runSize',
    BranchSize: 'branchSize',
    RunCenterToEnd: 'runCenterToEnd',
    BranchCenterToEnd: 'branchCenterToEnd',
    Standard: 'standard',
    BoreType: 'boreType',
    Length: 'length',
    Weight: 'weight',
    Source: 'source',
    Revision: 'revision',
    DatasetVersion: 'datasetVersion',
  };
  return { [map[col] || col]: value };
}

export function createMasterDbPopup({ store, container = document.body } = {}) {
  if (!store) throw new Error('Master DB popup requires store');
  const root = document.createElement('section');
  root.className = 'masterdb-modal is-hidden';
  root.innerHTML = '<div class="masterdb-dialog"><div class="masterdb-content"></div></div>';
  container.appendChild(root);
  const content = root.querySelector('.masterdb-content');

  function render(state = store.getState()) {
    root.classList.toggle('is-hidden', !state.open);
    renderMasterDbGrid(content, state, {
      onFilter: (value) => store.setFilterText(value),
      onAdd: () => {
        store.addRow({ Component: 'VALVE', Size: '100', Length: 0, Weight: 0 });
        emit('debug:trace', { scope: 'masterdb', event: 'ADD_ROW', ok: true, timestamp: Date.now() });
      },
      onDelete: (id) => {
        if (!id) return;
        store.deleteRow(id);
        emit('debug:trace', { scope: 'masterdb', event: 'DELETE_ROW', ok: true, timestamp: Date.now(), rowId: id });
      },
      onReset: () => {
        store.resetToSeed();
        emit('debug:trace', { scope: 'masterdb', event: 'RESET', ok: true, timestamp: Date.now() });
      },
      onExportJson: () => download('masterdb.json', exportMasterDbJson(store.getRows()), 'application/json;charset=utf-8'),
      onExportCsv: () => download('masterdb.csv', exportMasterDbCsv(store.getRows()), 'text/csv;charset=utf-8'),
      onClose: () => store.close(),
      onSelect: (id) => store.setSelected(id),
      onEdit: (id, col, value) => {
        store.updateRow(id, fieldPatchFromVisible(col, value));
      },
    });
  }

  const unsub = store.subscribe(render);
  render();

  root.addEventListener('click', (ev) => {
    if (ev.target === root) store.close();
  });

  return {
    root,
    render,
    open() {
      store.open();
      emit('debug:trace', { scope: 'masterdb', event: 'OPEN', ok: true, timestamp: Date.now() });
    },
    close() { store.close(); },
    destroy() {
      unsub?.();
      root.remove();
      appLogger.info('MASTERDB_POPUP_DESTROY', {});
    },
  };
}
