/**
 * formats/dxf/model/dxf-block.js
 *
 * Authoritative DXF Block definition (BLOCK ... ENDBLK).
 * Represents a reusable block definition, independent of INSERT instances.
 */

export class DxfBlock {
  constructor(params = {}) {
    this.name = params.name ? String(params.name) : '*UNNAMED';
    this.handle = params.handle ? String(params.handle).trim().toUpperCase() : null;
    this.ownerHandle = params.ownerHandle ? String(params.ownerHandle).trim().toUpperCase() : null;
    this.layerId = params.layerId || '0';
    this.basePoint = {
      x: params.basePoint?.x ?? 0,
      y: params.basePoint?.y ?? 0,
      z: params.basePoint?.z ?? 0,
    };
    this.flags = params.flags ?? 0;
    this.isAnonymous = Boolean(params.isAnonymous || (this.flags & 1));
    this.hasAttributes = Boolean(params.hasAttributes || (this.flags & 2));

    // Nested entities defined within this block
    this.entities = Array.isArray(params.entities) ? params.entities : [];

    this.source = {
      headerRawTags: Array.isArray(params.source?.headerRawTags) ? params.source.headerRawTags : [],
      endBlkRawTags: Array.isArray(params.source?.endBlkRawTags) ? params.source.endBlkRawTags : [],
    };
  }

  addEntity(entity) {
    this.entities.push(entity);
  }
}
