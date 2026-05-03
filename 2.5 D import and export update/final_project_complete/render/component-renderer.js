/**
 * Component renderer.
 *
 * In a full application this module would convert CEG components into
 * Three.js meshes or other graphics primitives. For the static-first
 * editor prototype we only create lightweight JavaScript objects that
 * carry userData for selection and highlighting. Downstream
 * renderers can wrap these into actual meshes.
 */

/**
 * Create a renderable body object for the given component. The body
 * object holds userData fields used throughout the editor. It also
 * tracks a `selected` property that UI code may toggle to indicate
 * selection.
 *
 * @param {Object} component Canonical component from the CEG
 * @returns {Object} A lightweight render object
 */
export function createBodyObject(component) {
  return {
    userData: {
      canonicalId: component.id,
      renderRole: 'BODY'
    },
    selected: false
  };
}