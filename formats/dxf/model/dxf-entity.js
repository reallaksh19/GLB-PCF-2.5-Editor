/**
 * formats/dxf/model/dxf-entity.js
 *
 * Core DxfEntity record representing an authoritative DXF entity.
 * Preserves source group-code tags for untouched round-trip fidelity.
 */



export class DxfEntity {
  /**
   * @param {Object} params
   */
  constructor(params = {}) {
    this.handle = params.handle ? String(params.handle).trim().toUpperCase() : null;
    this.ownerHandle = params.ownerHandle ? String(params.ownerHandle).trim().toUpperCase() : null;
    this.type = params.type ? String(params.type).trim().toUpperCase() : 'UNKNOWN';
    this.layerId = params.layerId || '0';
    this.space = params.space === 'paper' ? 'paper' : 'model';
    this.layoutId = params.layoutId || null;

    // Stable editor identity
    this.id = params.id || null; // Imported identities are assigned from document/record indexes.

    this.style = {
      colorMode: params.style?.colorMode || 'BYLAYER',
      colorIndex: params.style?.colorIndex ?? 256,
      trueColor: params.style?.trueColor ?? null,
      lineTypeMode: params.style?.lineTypeMode || 'BYLAYER',
      lineType: params.style?.lineType || 'BYLAYER',
      lineWeightMode: params.style?.lineWeightMode || 'BYLAYER',
      lineWeight: params.style?.lineWeight ?? -1,
      transparency: params.style?.transparency ?? null,
      ...(params.style || {}),
    };

    this.geometry = params.geometry || {};
    this.attributes = params.attributes || {};

    this.source = {
      order: params.source?.order ?? 0,
      rawTags: Array.isArray(params.source?.rawTags) ? params.source.rawTags : [],
    };

    this.state = {
      modified: Boolean(params.state?.modified),
      deleted: Boolean(params.state?.deleted),
      generated: Boolean(params.state?.generated),
    };
  }

  markModified() {
    this.state.modified = true;
  }

  markDeleted() {
    this.state.deleted = true;
  }
}
