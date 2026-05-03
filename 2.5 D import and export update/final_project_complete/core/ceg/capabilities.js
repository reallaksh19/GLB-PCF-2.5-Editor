/*
 * core/ceg/capabilities.js
 *
 * Provides default capability matrices for different component types.
 * Capabilities control which edit operations are permitted on a
 * component.  They are attached to each component record when
 * created.
 */

const CAPABILITY_MATRIX = {
  LINE: {
    canMove: true,
    canDelete: true,
    canStretch: true,
    canExtend: true,
    canExportDXF: true,
    canExportGLB: true
  },
  PIPE: {
    canMove: true,
    canDelete: true,
    canStretch: true,
    canExtend: true,
    canExportDXF: true,
    canExportGLB: true
  },
  ARC: {
    canMove: true,
    canDelete: true,
    canStretch: false,
    canExtend: false,
    canExportDXF: true,
    canExportGLB: true
  },
  BLOCK_COMPONENT: {
    canMove: true,
    canDelete: true,
    canStretch: false,
    canExtend: false,
    canExportDXF: true,
    canExportGLB: true
  },
  MESH_OBJECT: {
    canMove: true,
    canDelete: true,
    canStretch: false,
    canExtend: false,
    canExportDXF: false,
    canExportGLB: true
  },
  PROXY_DXF_ENTITY: {
    canMove: true,
    canDelete: true,
    canStretch: false,
    canExtend: false,
    canExportDXF: false,
    canExportGLB: false
  }
};

/**
 * Return a capability object for the given component type.  If the
 * type is unrecognized a conservative default is returned that
 * allows only move and delete.
 *
 * @param {string} type Component type.  E.g. 'LINE', 'PIPE'.
 * @returns {Object} Capability object.
 */
export function defaultCapabilities(type) {
  const caps = CAPABILITY_MATRIX[String(type)] || {
    canMove: true,
    canDelete: true,
    canStretch: false,
    canExtend: false,
    canExportDXF: false,
    canExportGLB: false
  };
  // Return a shallow copy to prevent accidental mutation of the
  // CAPABILITY_MATRIX constants
  return Object.assign({}, caps);
}