/*
 * core/ceg/capabilities.js
 *
 * Default capability matrices for component types.
 * Capabilities control which edit operations are permitted.
 */

const CAPABILITY_MATRIX = {
  LINE: {
    canMove: true, canDelete: true, canStretch: true, canExtend: true,
    canExportDXF: true, canExportGLB: true
  },
  PIPE: {
    canMove: true, canDelete: true, canStretch: true, canExtend: true,
    canExportDXF: true, canExportGLB: true
  },
  ARC: {
    canMove: true, canDelete: true, canStretch: false, canExtend: false,
    canExportDXF: true, canExportGLB: true
  },
  BLOCK_COMPONENT: {
    canMove: true, canDelete: true, canStretch: false, canExtend: false,
    canExportDXF: true, canExportGLB: true
  },
  MESH_OBJECT: {
    canMove: true, canDelete: true, canStretch: false, canExtend: false,
    canExportDXF: false, canExportGLB: true
  },
  PROXY_DXF_ENTITY: {
    canMove: true, canDelete: true, canStretch: false, canExtend: false,
    canExportDXF: false, canExportGLB: false
  }
};

/**
 * Return a capability object for the given component type.
 * Unknown types get a conservative default (move + delete only).
 *
 * @param {string} type Component type string.
 * @returns {Object} Shallow copy of the capability record.
 */
export function defaultCapabilities(type) {
  const caps = CAPABILITY_MATRIX[String(type)] || {
    canMove: true, canDelete: true, canStretch: false, canExtend: false,
    canExportDXF: false, canExportGLB: false
  };
  return Object.assign({}, caps);
}
