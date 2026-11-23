const utf8 = new TextDecoder('utf-8');
const utf16be = new TextDecoder('utf-16be');
const utf16le = new TextDecoder('utf-16le');
const latin1 = new TextDecoder('latin1');

export function decodeUtf8(b: Uint8Array): string {
  return utf8.decode(b);
}

/** Decode UTF-16 with optional BOM (defaults to big-endian). */
export function decodeUtf16(b: Uint8Array): string {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return utf16le.decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return utf16be.decode(b.subarray(2));
  return utf16be.decode(b);
}

export function decodeLatin1(b: Uint8Array): string {
  return latin1.decode(b);
}
