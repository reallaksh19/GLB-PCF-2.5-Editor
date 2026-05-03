/*
 * core/ceg/render-refs.js
 *
 * Render references are maintained by the render projection.  They
 * map canonical component and anchor IDs to Three.js objects.
 */

/**
 * Create an empty renderRefs map.  Keys are canonical IDs and values
 * are objects populated by the renderer.  This file exists to
 * declare the structure, but Wave 1 does not fill it.
 */
export function createRenderRefs() {
  return {};
}