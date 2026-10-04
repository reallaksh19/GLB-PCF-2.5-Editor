/**
 * formats/dxf/parser/dxf-token-stream.js
 *
 * Fast, zero-loss DXF token stream reader.
 * Parses raw DXF text into group code/value pairs while preserving exact line numbering
 * and string formatting.
 */

export class DxfTokenStream {
  /**
   * @param {string} text Raw DXF text content.
   */
  constructor(text) {
    if (typeof text !== 'string') {
      throw new TypeError('DxfTokenStream expects a string input');
    }
    this.text = text.replace(/^\uFEFF/, ''); // strip BOM
    this.tokens = [];
    this.cursor = 0;
    this._tokenize();
  }

  _tokenize() {
    const lines = this.text.split(/\r?\n/);
    const n = lines.length;
    let i = 0;

    while (i < n - 1) {
      const codeStr = lines[i].trim();
      if (codeStr === '') {
        i++;
        continue;
      }

      const code = parseInt(codeStr, 10);
      if (Number.isNaN(code)) {
        i++;
        continue;
      }

      const value = lines[i + 1] !== undefined ? lines[i + 1] : '';
      this.tokens.push({
        code,
        value,
        line: i + 1,
      });

      i += 2;
    }
  }

  get length() {
    return this.tokens.length;
  }

  hasNext() {
    return this.cursor < this.tokens.length;
  }

  next() {
    if (!this.hasNext()) return null;
    return this.tokens[this.cursor++];
  }

  peek(offset = 0) {
    const idx = this.cursor + offset;
    if (idx < 0 || idx >= this.tokens.length) return null;
    return this.tokens[idx];
  }

  rewind(count = 1) {
    this.cursor = Math.max(0, this.cursor - count);
  }

  seek(position) {
    this.cursor = Math.max(0, Math.min(this.tokens.length, position));
  }

  tell() {
    return this.cursor;
  }
}
