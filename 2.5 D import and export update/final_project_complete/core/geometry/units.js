/*
 * core/geometry/units.js
 *
 * Provides utility functions for unit conversions.  Wave 1 uses
 * millimetres as the base unit; other units may be added in later
 * waves.
 */

/**
 * Convert a value from millimetres to the specified units.  When
 * unsupported units are requested the input value is returned
 * unchanged.
 *
 * @param {number} mm Millimetres.
 * @param {string} units Target units (e.g. 'mm', 'm', 'in').
 */
export function mmToUnits(mm, units) {
  switch (units) {
    case 'mm': return mm;
    case 'm':  return mm / 1000;
    case 'cm': return mm / 10;
    case 'in': return mm / 25.4;
    case 'ft': return mm / 304.8;
    default:   return mm;
  }
}

/**
 * Convert a value from the specified units to millimetres.  When
 * unsupported units are provided the input value is returned
 * unchanged.
 *
 * @param {number} value The value in `units`.
 * @param {string} units Source units.
 */
export function unitsToMm(value, units) {
  switch (units) {
    case 'mm': return value;
    case 'm':  return value * 1000;
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
    case 'ft': return value * 304.8;
    default:   return value;
  }
}