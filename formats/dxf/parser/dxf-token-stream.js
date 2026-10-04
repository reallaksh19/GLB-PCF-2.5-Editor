/** Lossless byte-backed token views. Values are decoded lazily; source bytes never normalize. */
class DxfToken {
  constructor(stream, code, line, start, codeEnd, valueStart, valueEnd, end) {
    Object.assign(this, { stream, code, line, start, codeEnd, valueStart, valueEnd, end });
    Object.freeze(this);
  }
  get value() { return this.stream.decodeSpan(this.valueStart, this.valueEnd); }
  get rawCode() { return this.stream.decodeSpan(this.start, this.codeEnd); }
  get span() { return { start: this.start, end: this.end }; }
  get codeSpan() { return { start: this.start, end: this.codeEnd }; }
  get valueSpan() { return { start: this.valueStart, end: this.valueEnd }; }
}

const CODEPAGES = {
  ANSI_1250: 'windows-1250', ANSI_1251: 'windows-1251', ANSI_1252: 'windows-1252',
  ANSI_1253: 'windows-1253', ANSI_1254: 'windows-1254', ANSI_1255: 'windows-1255',
  ANSI_1256: 'windows-1256', ANSI_1257: 'windows-1257', ANSI_1258: 'windows-1258',
  ANSI_932: 'shift_jis', ANSI_936: 'gbk', ANSI_949: 'euc-kr', ANSI_950: 'big5',
  DOS866: 'ibm866', UTF_8: 'utf-8', UTF8: 'utf-8',
};

export class DxfTokenStream {
  #bytes;
  #decoder = new TextDecoder('utf-8', { fatal: true });
  #reportedDecodeOffsets = new Set();
  constructor(input) {
    this.inputKind = typeof input === 'string' ? 'text' : 'bytes';
    if (typeof input === 'string') this.#bytes = new TextEncoder().encode(input);
    else if (input instanceof ArrayBuffer) this.#bytes = new Uint8Array(input.slice(0));
    else if (input instanceof Uint8Array) this.#bytes = new Uint8Array(input);
    else throw new TypeError('DXF input must be a string, Uint8Array or ArrayBuffer');
    this.tokens = [];
    this.diagnostics = [];
    this.cursor = 0;
    this.encoding = 'utf-8';
    this.declaredCodepage = null;
    this.acadVersion = null;
    this.newline = null;
    const signature = 'AutoCAD Binary DXF\r\n\x1a\0';
    this.binary = this.#bytes.length >= signature.length && [...signature].every((c, i) => this.#bytes[i] === c.charCodeAt(0));
    if (this.binary) {
      this.diagnostics.push({ code: 'UNSUPPORTED_BINARY_DXF', severity: 'error', offset: 0 });
      return;
    }
    this._tokenize();
    this._encoding();
  }
  get originalBytes() { return this.#bytes.slice(); }
  get byteLength() { return this.#bytes.length; }
  get text() { return this.decodeSpan(0, this.#bytes.length); }
  byteSlice(start = 0, end = this.#bytes.length) { return this.#bytes.slice(start, end); }
  decodeSpan(start, end) {
    try { return this.#decoder.decode(this.#bytes.subarray(start, end)); }
    catch {
      if (!this.#reportedDecodeOffsets.has(start)) {
        this.#reportedDecodeOffsets.add(start);
        this.diagnostics.push({ code: 'DECODE_ERROR', severity: 'error', offset: start, encoding: this.encoding });
      }
      return new TextDecoder(this.encoding).decode(this.#bytes.subarray(start, end));
    }
  }
  _tokenize() {
    const lines = [];
    let start = this.#bytes[0] === 239 && this.#bytes[1] === 187 && this.#bytes[2] === 191 ? 3 : 0;
    this.bomLength = start;
    let line = 1;
    while (start < this.#bytes.length) {
      let end = start;
      while (end < this.#bytes.length && this.#bytes[end] !== 10 && this.#bytes[end] !== 13) end++;
      let next = end;
      if (next < this.#bytes.length) {
        const newline = this.#bytes[next] === 13 && this.#bytes[next + 1] === 10 ? '\r\n' : this.#bytes[next] === 13 ? '\r' : '\n';
        next += newline.length;
        if (this.newline === null) this.newline = newline;
        else if (this.newline !== newline) this.newline = 'mixed';
      }
      lines.push({ start, end, next, line: line++ });
      start = next;
    }
    const ascii = new TextDecoder('utf-8');
    let eof = false;
    for (let i = 0; i < lines.length; i += 2) {
      const a = lines[i], b = lines[i + 1];
      if (eof && lines.slice(i).every(l => /^[\s]*$/.test(ascii.decode(this.#bytes.subarray(l.start, l.end))))) break;
      if (!b) {
        this.diagnostics.push({ code: 'MISSING_GROUP_VALUE', severity: 'error', line: a.line, offset: a.start });
        break;
      }
      const lexeme = ascii.decode(this.#bytes.subarray(a.start, a.end)).trim();
      const code = /^[0-9]+$/.test(lexeme) && Number(lexeme) <= 1071 ? Number(lexeme) : null;
      if (code === null) this.diagnostics.push({ code: 'INVALID_GROUP_CODE', severity: 'error', line: a.line, offset: a.start });
      const token = new DxfToken(this, code, a.line, a.start, a.end, b.start, b.end, b.next);
      this.tokens.push(token);
      eof ||= code === 0 && ascii.decode(this.#bytes.subarray(b.start, b.end)).trim().toUpperCase() === 'EOF';
    }
  }
  _encoding() {
    for (let i = 0; i + 1 < this.tokens.length; i++) {
      const t = this.tokens[i], next = this.tokens[i + 1];
      if (t.code === 9 && t.value.trim() === '$ACADVER') this.acadVersion = next.value.trim();
      if (t.code === 9 && t.value.trim() === '$DWGCODEPAGE') this.declaredCodepage = next.value.trim();
    }
    if (this.inputKind === 'text' || this.bomLength || (this.acadVersion && this.acadVersion >= 'AC1021')) return;
    const label = this.declaredCodepage ? CODEPAGES[this.declaredCodepage.toUpperCase()] : 'utf-8';
    try {
      if (!label) throw new RangeError('Unsupported codepage');
      this.#decoder = new TextDecoder(label, { fatal: true });
      this.encoding = label;
    } catch {
      this.diagnostics.push({ code: 'UNSUPPORTED_CODEPAGE', severity: 'error', codepage: this.declaredCodepage });
    }
  }
  substream(start, end) {
    const child = new DxfTokenStream(new Uint8Array());
    child.#bytes = this.#bytes;
    child.#decoder = this.#decoder;
    child.tokens = this.tokens.slice(start, end);
    child.diagnostics = this.diagnostics;
    child.encoding = this.encoding;
    return child;
  }
  get length() { return this.tokens.length; }
  hasNext() { return this.cursor < this.tokens.length; }
  next() { return this.hasNext() ? this.tokens[this.cursor++] : null; }
  peek(offset = 0) { return this.tokens[this.cursor + offset] || null; }
  rewind(count = 1) { this.cursor = Math.max(0, this.cursor - count); }
  seek(position) { this.cursor = Math.max(0, Math.min(this.tokens.length, position)); }
  tell() { return this.cursor; }
}
