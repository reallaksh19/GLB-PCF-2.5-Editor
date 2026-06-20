import { isTaggedValue, VALUE_BASIS } from './valueBasis.js';

export const NORMALIZATION_DATASET_VERSION = 'db-normalization-foundation/v1';
export const REQUIRED_ROW_PROVENANCE = ['standard', 'source', 'datasetVersion', 'dataStatus'];

export function makeNormalizedRow(input) {
  const row = {
    id: input.id,
    componentType: input.componentType,
    subtype: input.subtype ?? null,
    keys: input.keys ?? {},
    dimensions: input.dimensions ?? {},
    weights: input.weights ?? {},
    connection: input.connection ?? {},
    render: input.render ?? {},
    analysis: input.analysis ?? {},
    extras: input.extras ?? {},
    provenance: input.provenance,
    sourceRefs: input.sourceRefs ?? [],
    diagnostics: input.diagnostics ?? [],
  };
  validateNormalizedRow(row);
  return row;
}

export function validateNormalizedRow(row) {
  if (!row?.id) throw new Error('NORMALIZED_ROW_MISSING_ID');
  if (!row.componentType) throw new Error('NORMALIZED_ROW_MISSING_COMPONENT_TYPE');
  validateProvenance(row.provenance);
  validateTaggedNumbers(row);
  return true;
}

export function validateProvenance(provenance) {
  for (const field of REQUIRED_ROW_PROVENANCE) {
    if (!provenance?.[field]) throw new Error(`PROVENANCE_MISSING_${field}`);
  }
  return true;
}

export function collectTaggedValues(value, path = '$', found = []) {
  if (isTaggedValue(value)) found.push({ path, value });
  else if (Array.isArray(value)) value.forEach((item, index) => collectTaggedValues(item, `${path}[${index}]`, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectTaggedValues(item, `${path}.${key}`, found);
  }
  return found;
}

function validateTaggedNumbers(row) {
  for (const { path, value } of collectTaggedValues(row)) {
    if (!Object.values(VALUE_BASIS).includes(value.basis)) throw new Error(`INVALID_VALUE_BASIS:${path}`);
    if (typeof value.value === 'number' && !Number.isFinite(value.value)) throw new Error(`INVALID_NUMBER:${path}`);
  }
}
