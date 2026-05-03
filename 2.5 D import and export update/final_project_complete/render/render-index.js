/**
 * Render Index module.
 *
 * This index provides mappings between canonical model ids and their
 * associated render objects. It forms the backbone of the render
 * projection layer and should be used by selection, highlighting and
 * cleanup logic. Do not store CEG data here—only references to
 * render objects created by the renderer.
 */

export function createRenderIndex() {
  return {
    /**
     * Map from canonical component id to an array of render objects.
     * A component may have multiple visual objects (body, labels,
     * helpers), so we track them as an array.
     */
    componentToObjects: new Map(),
    /**
     * WeakMap from render object back to its canonical component id.
     * WeakMap ensures objects are garbage-collected when removed from
     * the scene.
     */
    objectToComponent: new WeakMap(),
    /**
     * Map from anchor id to its grip object. Each editable anchor
     * corresponds to exactly one grip in the render layer.
     */
    anchorToGrip: new Map(),
    /**
     * Map from layer name to an array of render objects in that layer.
     * Layer visibility can be toggled without touching the CEG.
     */
    layerToObjects: new Map()
  };
}