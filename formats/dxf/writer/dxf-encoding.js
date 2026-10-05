// TextDecoder supplies the source codepage mapping; its inverse never substitutes '?' or U+FFFD.
const encoders = new Map();
export function encodeDxfText(text, encoding = 'utf-8') {
  text = String(text);
  if (encoding === 'utf-8' || !/[^\x00-\x7f]/.test(text)) return new TextEncoder().encode(text);
  let map = encoders.get(encoding);
  if (!map) {
    map = new Map();
    const decoder = new TextDecoder(encoding, { fatal: true });
    const add = bytes => {
      try {
        const char = decoder.decode(Uint8Array.from(bytes));
        if ([...char].length === 1 && !map.has(char)) map.set(char, bytes);
      } catch { /* Unassigned source bytes have no encoding inverse. */ }
    };
    for (let i = 0; i < 256; i++) add([i]);
    if (['shift_jis', 'gbk', 'euc-kr', 'big5'].includes(encoding)) {
      for (let i = 0x80; i < 256; i++) for (let j = 0x40; j < 256; j++) add([i, j]);
    }
    encoders.set(encoding, map);
  }
  const bytes = [];
  for (const char of text) {
    const encoded = map.get(char);
    if (!encoded) throw new Error('Unencodable edit in source encoding ' + encoding + ': ' + char);
    bytes.push(...encoded);
  }
  return Uint8Array.from(bytes);
}
