export const VALUE_BASIS = Object.freeze({
  SOURCE_VALUE: 'SOURCE_VALUE',
  DERIVED_VALUE: 'DERIVED_VALUE',
  UNAVAILABLE: 'UNAVAILABLE',
});

export function sourceValue(value, unit = null, meta = {}) {
  return compact({ basis: VALUE_BASIS.SOURCE_VALUE, value, unit, ...meta });
}

export function numericSource(value, unit = null, meta = {}) {
  const number = toFiniteNumber(value);
  return number === null
    ? unavailable('NUMERIC_UNAVAILABLE', { rawValue: value, unit, ...meta })
    : sourceValue(number, unit, meta);
}

export function derivedValue(value, formula, inputs = {}, unit = null) {
  const number = toFiniteNumber(value);
  return number === null
    ? unavailable('DERIVED_VALUE_INVALID', { formula, inputs, unit, rawValue: value })
    : compact({ basis: VALUE_BASIS.DERIVED_VALUE, value: number, formula, inputs, unit });
}

export function unavailable(reason, details = {}) {
  return { basis: VALUE_BASIS.UNAVAILABLE, value: null, reason, ...details };
}

export function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function isTaggedValue(value) {
  return value && typeof value === 'object' && Object.values(VALUE_BASIS).includes(value.basis);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}
