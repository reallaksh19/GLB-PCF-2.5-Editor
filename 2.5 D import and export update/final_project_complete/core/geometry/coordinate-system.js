/*
 * core/geometry/coordinate-system.js
 *
 * Defines coordinate system constants used throughout the editor.
 * Currently only WORLD_XYZ is supported.  In later waves this
 * module may handle axis conventions (e.g. Z-up, Y-up).
 */

export const CoordinateSystems = Object.freeze({
  WORLD_XYZ: 'WORLD_XYZ'
});

export function isValidCoordinateSystem(cs) {
  return Object.values(CoordinateSystems).includes(cs);
}