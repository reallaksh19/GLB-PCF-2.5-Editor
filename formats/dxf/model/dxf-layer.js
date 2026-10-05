/**
 * formats/dxf/model/dxf-layer.js
 *
 * Authoritative DXF Layer definition.
 */

export class DxfLayer {
  constructor(params = {}) {
    this.name = params.name ? String(params.name) : '0';
    this.handle = params.handle ? String(params.handle).trim().toUpperCase() : null;
    this.ownerHandle = params.ownerHandle ? String(params.ownerHandle).trim().toUpperCase() : null;
    this.colorIndex = params.colorIndex ?? 7; // standard AutoCAD default: 7 (white/black)
    this.trueColor = params.trueColor ?? null;
    this.lineType = params.lineType || 'CONTINUOUS';
    this.lineWeight = params.lineWeight ?? -3; // -3 = standard default
    this.flags = params.flags ?? 0;
    this.frozen = Boolean(params.frozen || (this.flags & 1));
    this.locked = Boolean(params.locked || (this.flags & 4));
    this.off = Boolean(params.off || (this.colorIndex < 0));
    if (this.off && this.colorIndex < 0) {
      this.colorIndex = Math.abs(this.colorIndex);
    }

    this.source = {
      rawTags: Array.isArray(params.source?.rawTags) ? params.source.rawTags : [],
    };
  }

  setVisible(visible) {
    this.off = !visible;
  }

  setFrozen(frozen) {
    this.frozen = Boolean(frozen);
    this.flags = frozen ? this.flags | 1 : this.flags & ~1;
  }

  setLocked(locked) {
    this.locked = Boolean(locked);
    this.flags = locked ? this.flags | 4 : this.flags & ~4;
  }

  setColor(colorIndex, trueColor = null) {
    this.colorIndex = colorIndex;
    this.trueColor = trueColor;
  }

  isVisible() {
    return !this.off && !this.frozen;
  }
}
