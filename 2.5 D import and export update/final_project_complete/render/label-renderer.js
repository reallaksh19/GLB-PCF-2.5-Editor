/**
 * Label renderer.
 *
 * Labels display small bits of text related to components. They are
 * attached to components and carry userData for selection but do not
 * typically handle direct interactions.
 */

/**
 * Create a label object for a component. Labels can be used for
 * annotations, component names, or other metadata. The text can be
 * supplied explicitly or defaults to the component id.
 *
 * @param {Object} component Canonical component
 * @param {string} [text] The text to display on the label
 * @returns {Object} A label object
 */
export function createLabelObject(component, text) {
  return {
    userData: {
      canonicalId: component.id,
      renderRole: 'LABEL'
    },
    text: text || component.id,
    selected: false
  };
}