/*
 * core/ceg/source-refs.js
 *
 * Source references store pointers back to the original format
 * entities (e.g. DXF handle, GLB node UUID).  They are keyed by
 * component or anchor ID.
 */

/**
 * Create an empty sourceRefs map.
 */
export function createSourceRefs() {
  return {};
}