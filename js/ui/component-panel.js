import { capabilities } from '../capabilities/capability-registry.js';

export function clearPanel(container) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('empty');
}

export function renderPanel(sections, container) {
  if (!container) return;
  container.classList.remove('empty');
  container.innerHTML = '';

  for (const section of sections) {
    if (!section.rows || section.rows.length === 0) continue;

    const secDiv = document.createElement('div');
    secDiv.className = 'panel-section';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'panel-section-title';
    titleDiv.textContent = section.title;
    secDiv.appendChild(titleDiv);

    const table = document.createElement('table');
    table.className = 'panel-table';

    for (const row of section.rows) {
      const tr = document.createElement('tr');
      if (row.highlight) tr.className = 'row-highlight';

      const tdLabel = document.createElement('td');
      tdLabel.className = 'panel-label';
      tdLabel.textContent = row.label;

      const tdValue = document.createElement('td');
      tdValue.className = 'panel-value';
      tdValue.textContent = row.value || '—';

      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      table.appendChild(tr);
    }

    secDiv.appendChild(table);
    container.appendChild(secDiv);
  }
}

// ─── Self-check (runs only in dev mode) ───────────────────────────────────────
function _selfCheck() {
  const container = document.createElement('div');
  const failures = [];

  try {
    clearPanel(container);
    if (!container.classList.contains('empty') || container.innerHTML !== '') {
      failures.push('clearPanel failed to clear and add empty class');
    }

    renderPanel([{ title: 'Test', rows: [{ label: 'L', value: 'V', highlight: true }] }], container);
    if (container.classList.contains('empty')) {
      failures.push('renderPanel failed to remove empty class');
    }

    const secDiv = container.querySelector('.panel-section');
    if (!secDiv) {
      failures.push('renderPanel failed to render section div');
    } else {
      const highlightRow = secDiv.querySelector('.row-highlight');
      if (!highlightRow) failures.push('renderPanel failed to apply highlight class');
    }

    renderPanel([{ title: 'Empty Section', rows: [] }], container);
    if (container.querySelector('.panel-section')) {
      failures.push('renderPanel rendered section with no rows');
    }

    renderPanel([{ title: 'Null Value', rows: [{ label: 'L', value: '' }] }], container);
    const tdVal = container.querySelector('.panel-value');
    if (!tdVal || tdVal.textContent !== '—') {
      failures.push('renderPanel failed to render default dash for empty value');
    }
  } catch (err) {
    failures.push(`Component panel threw error: ${err.message}`);
  }

  return { pass: failures.length === 0, failures };
}

if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
  const { pass, failures } = _selfCheck();
  if (pass) capabilities.ready('component-panel');
  else       capabilities.fail('component-panel', failures);
}
