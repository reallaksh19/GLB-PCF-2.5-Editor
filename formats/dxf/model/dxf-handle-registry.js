/** Session allocation never rounds 64-bit handles or invents handles during parsing. */
export function normalizeHandle(value) {
  const lexeme = String(value ?? '').trim();
  if (!/^[0-9a-f]{1,16}$/i.test(lexeme)) return null;
  return BigInt('0x' + lexeme).toString(16).toUpperCase();
}
export class DxfHandleRegistry {
  constructor(initialSeed = '1') {
    this.knownHandles = new Set();
    this.nextNumericHandle = 1n;
    this.sourceSeed = null;
    this.setSeed(initialSeed);
  }
  setSeed(value) {
    const handle = normalizeHandle(value);
    if (handle === null) return false;
    this.sourceSeed = String(value);
    const next = BigInt('0x' + handle);
    if (next > this.nextNumericHandle) this.nextNumericHandle = next;
    return true;
  }
  register(value) {
    const handle = normalizeHandle(value);
    if (handle === null) return false;
    this.knownHandles.add(handle);
    const next = BigInt('0x' + handle) + 1n;
    if (next > this.nextNumericHandle) this.nextNumericHandle = next;
    return true;
  }
  has(value) { const h = normalizeHandle(value); return h !== null && this.knownHandles.has(h); }
  allocate() {
    if (this.nextNumericHandle > 0xffffffffffffffffn) throw new RangeError('DXF handle space exhausted');
    const h = this.nextNumericHandle.toString(16).toUpperCase();
    this.register(h);
    return h;
  }
  get handseed() { return this.nextNumericHandle.toString(16).toUpperCase(); }
}
