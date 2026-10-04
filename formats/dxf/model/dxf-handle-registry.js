/**
 * formats/dxf/model/dxf-handle-registry.js
 *
 * Manages AutoCAD 16-hex handles and $HANDSEED tracking.
 */

export class DxfHandleRegistry {
  constructor(initialSeed = '1') {
    this.knownHandles = new Set();
    this.maxNumericHandle = 0;
    this.setSeed(initialSeed);
  }

  setSeed(seedStr) {
    if (!seedStr) return;
    const clean = String(seedStr).trim();
    const val = parseInt(clean, 16);
    if (!Number.isNaN(val) && val > this.maxNumericHandle) {
      this.maxNumericHandle = val;
    }
  }

  register(handleStr) {
    if (!handleStr) return;
    const clean = String(handleStr).trim().toUpperCase();
    this.knownHandles.add(clean);
    const val = parseInt(clean, 16);
    if (!Number.isNaN(val) && val > this.maxNumericHandle) {
      this.maxNumericHandle = val;
    }
  }

  has(handleStr) {
    if (!handleStr) return false;
    return this.knownHandles.has(String(handleStr).trim().toUpperCase());
  }

  allocate() {
    this.maxNumericHandle++;
    const nextHex = this.maxNumericHandle.toString(16).toUpperCase();
    this.knownHandles.add(nextHex);
    return nextHex;
  }

  get handseed() {
    // $HANDSEED in DXF specifies the NEXT available handle
    return (this.maxNumericHandle + 1).toString(16).toUpperCase();
  }
}
