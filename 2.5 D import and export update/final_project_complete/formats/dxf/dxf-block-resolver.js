/*
 * formats/dxf/dxf-block-resolver.js
 *
 * Block resolver for DXF.  In Wave 2 this module provides a
 * no‑op implementation because our mock fixtures do not include
 * nested block definitions.  Future waves may expand this to
 * resolve inserted block references into component definitions.
 */

/**
 * Resolve blocks in a RawDXFModel.  Currently a no‑op.  Returns the
 * original model unchanged.  In later waves this would expand
 * block definitions and inline their entities with appropriate
 * transforms.
 *
 * @param {Object} model Raw DXF model.
 * @returns {Object} Same model for chaining.
 */
export function resolveBlocks(model) {
  // No block expansion performed in Wave 2
  return model;
}