import { componentSearch, SEARCH_MODE } from '../db/componentSearch.js';

export const COMPONENT_STUDIO_SCHEMA = 'pipedata-component-studio-model/v1';

const CATEGORIES = ['Valves', 'Pipe', 'Fittings', 'Flanges', 'Supports', 'Gaskets', 'Olets', 'Reducers', 'Coverage', 'Export'];
const PANES = ['selector', 'canvas', 'catalogDashboard'];
const REQUIRED_PROVENANCE = ['standard', 'source', 'datasetVersion', 'dataStatus'];

const LABELS = {
  faceToFaceRfMm: 'RF Face-to-face',
  faceToFaceRtjMm: 'RTJ Face-to-face',
  buttWeldLengthMm: 'BW Length',
  heightMm: 'Valve Height',
  handwheelDiaMm: 'Handwheel Dia',
  rtjAddLengthMm: 'RTJ Add Length',
  gapMm: 'Gap',
  rfRtjKg: 'RF/RTJ Weight',
  buttWeldKg: 'BW Weight',
};

export function createComponentStudioModel(options = {}) {
  const query = options.query ?? 'gate valve 8 class 150 rf';
  const aliases = options.aliases ?? [];
  const searchIndex = options.searchIndex ?? { entries: [] };
  const search = componentSearch(query, searchIndex, {
    aliases,
    filters: options.filters ?? {},
    mode: SEARCH_MODE.EXACT_ALIAS_ONLY,
  });
  const selectedEntry = search.results?.[0]?.entry ?? null;
  const row = selectedEntry ? findCatalogRow(selectedEntry, options.catalogs ?? {}) : null;

  return {
    schema: COMPONENT_STUDIO_SCHEMA,
    phase: 'UI_COMPONENT_STUDIO_01',
    layout: studioLayout(),
    selector: selectorState(query, selectedEntry, row, searchIndex),
    search: searchState(search, selectedEntry),
    dataPanel: dataPanel(row),
    canvas: canvasState(row),
    preview: previewState(row),
    verification: verificationState(row, search),
    sourceAudit: sourceAuditState(row),
  };
}

function studioLayout() {
  return {
    categories: CATEGORIES,
    panes: PANES,
    sourceTreeVisible: false,
    sourceAuditMode: 'collapsed-details',
    normalWorkflow: ['selector', 'canvas', 'catalogDashboard', 'verification'],
    mainSplit: { selector: '1/3', canvas: '2/3' },
  };
}

function selectorState(query, entry, row, index) {
  return {
    query,
    mode: SEARCH_MODE.EXACT_ALIAS_ONLY,
    quickFilters: ['VLV', 'FLG', 'PIPE', 'FTBW', 'GASKET', 'SUPPORT'],
    selectedId: entry?.id ?? null,
    selectedFamily: entry?.family ?? null,
    selectedStatus: row?.dataStatus ?? entry?.dataStatus ?? null,
    hierarchy: selectorHierarchy(index),
    noFallbackPolicy: index.noFallbackPolicy ?? 'No nearest-size, class, schedule, or family fallback.',
  };
}

function searchState(search, entry) {
  return {
    ok: search.ok,
    mode: search.mode,
    resultCount: search.results.length,
    selectedId: entry?.id ?? null,
    diagnostics: search.diagnostics,
  };
}

function dataPanel(row) {
  if (!row) {
    return {
      title: 'No exact component selected',
      identity: [],
      attributes: [],
      normalizedRowAvailable: false,
    };
  }
  return {
    title: componentTitle(row),
    identity: identityCells(row),
    attributes: [...taggedAttributes(row.dimensions), ...taggedAttributes(row.weights)],
    normalizedRowAvailable: true,
    normalizedRowId: row.id,
  };
}

function previewState(row) {
  return {
    type: 'CAD_DIMENSION_PREVIEW',
    viewModes: ['Orbit', 'Pan', 'Zoom', 'Top', 'Side', 'Iso'],
    toggles: ['Dimensions', 'Leaders', 'Source Tags', 'Provenance', 'Hidden Edges'],
    primaryDimensions: row ? taggedAttributes(row.dimensions).filter((item) => item.value !== null).slice(0, 6) : [],
  };
}

function canvasState(row) {
  return {
    type: 'GRAPHICS_AND_COMPONENT_DATA_CANVAS',
    embedsDataPanel: true,
    dataPanel: dataPanel(row),
    primaryDimensions: row ? taggedAttributes(row.dimensions).filter((item) => item.value !== null).slice(0, 6) : [],
  };
}

function verificationState(row, search) {
  return [
    chip('Exact match', search.ok),
    chip('No fallback used', search.mode === SEARCH_MODE.EXACT_ALIAS_ONLY),
    chip('No fabricated dimensions', row ? noFabricatedValues(row) : false),
    chip('Provenance complete', row ? hasRequiredProvenance(row) : false),
    chip(`Status ${row?.dataStatus ?? 'NONE'}`, Boolean(row?.dataStatus)),
  ];
}

function sourceAuditState(row) {
  return {
    visibleInNormalWorkflow: false,
    source: row?.source ?? null,
    sourceRowNumber: row?.sourceRowNumber ?? null,
    datasetVersion: row?.datasetVersion ?? null,
    taggedValueCount: row ? taggedAttributes(row.dimensions).length + taggedAttributes(row.weights).length : 0,
  };
}

function selectorHierarchy(index) {
  const entries = Array.isArray(index?.entries) ? index.entries : [];
  return {
    source: 'component-search.index.json',
    levels: ['componentType', 'typeOrSubtype', 'nps', 'classRatingOrSchedule', 'facing'],
    componentTypes: uniqueValues(entries, 'componentType'),
    valveTypes: uniqueValues(entries.filter((entry) => entry.filters?.componentType === 'VALVE'), 'valveType'),
    flangeTypes: uniqueValues(entries.filter((entry) => entry.filters?.componentType === 'FLANGE'), 'subtype'),
  };
}

function uniqueValues(entries, key) {
  return [...new Set(entries.map((entry) => entry.filters?.[key]).filter(Boolean))].sort();
}

function findCatalogRow(entry, catalogs) {
  const rows = catalogs[entry.family] ?? catalogs[entry.source] ?? [];
  return rows.find((row) => row.id === entry.id) ?? null;
}

function identityCells(row) {
  return [
    ['Type', row.componentType],
    ['Subtype', row.valveType ?? row.subtype ?? row.endType],
    ['NPS', row.nps],
    ['Class/Schedule', row.classRating ?? row.schedule],
    ['Status', row.dataStatus],
  ].filter(([, value]) => value !== undefined && value !== null);
}

function taggedAttributes(group = {}) {
  return Object.entries(group).map(([key, tagged]) => ({
    key,
    label: LABELS[key] ?? labelize(key),
    value: tagged?.value ?? null,
    unit: tagged?.unit ?? null,
    basis: tagged?.basis ?? 'UNAVAILABLE',
    sourceColumn: tagged?.sourceColumn ?? null,
  }));
}

function componentTitle(row) {
  const parts = [row.valveType ?? row.subtype, row.componentType, row.endType, row.facing, row.nps && `NPS ${row.nps}`, row.classRating && `Class ${row.classRating}`];
  return parts.filter(Boolean).join(' · ');
}

function hasRequiredProvenance(row) {
  return REQUIRED_PROVENANCE.every((field) => row.provenance?.[field] ?? row[field]);
}

function noFabricatedValues(row) {
  return [...taggedAttributes(row.dimensions), ...taggedAttributes(row.weights)]
    .every((item) => ['SOURCE_VALUE', 'DERIVED_VALUE', 'UNAVAILABLE'].includes(item.basis));
}

function chip(label, ok) {
  return { label, status: ok ? 'ok' : 'warn' };
}

function labelize(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
