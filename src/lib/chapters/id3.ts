import type { ByteSource, Chapter } from './types';
import { finishChapters } from './types';
import { decodeLatin1, decodeUtf16, decodeUtf8 } from './text';

const syncsafe = (b: Uint8Array, o: number) =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function decodeText(enc: number, b: Uint8Array): string {
  const s = enc === 0 ? decodeLatin1(b) : enc === 1 || enc === 2 ? decodeUtf16(b) : decodeUtf8(b);
  return s.split('\0')[0];
}

/** Undo ID3 unsynchronisation (0xFF 0x00 → 0xFF). */
function unsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    out[j++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, j);
}

interface Frame {
  id: string;
  data: Uint8Array;
}

function* frames(tag: Uint8Array, start: number, end: number, major: number): Generator<Frame> {
  let o = start;
  while (o + 10 <= end) {
    const id = String.fromCharCode(tag[o], tag[o + 1], tag[o + 2], tag[o + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) return; // padding
    const size = major === 4 ? syncsafe(tag, o + 4) : u32(tag, o + 4);
    const flags = tag[o + 9];
    let data = tag.subarray(o + 10, Math.min(o + 10 + size, end));
    if (major === 4) {
      if (flags & 0x01) data = data.subarray(4); // data length indicator
      if (flags & 0x02) data = unsync(data);
    }
    yield { id, data };
    o += 10 + size;
  }
}

export function isId3(head: Uint8Array): boolean {
  return head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
}

/** MP3 ID3v2.3/2.4 CHAP frames, titles from TIT2 sub-frames. */
export async function parseId3Chapters(src: ByteSource, duration?: number): Promise<Chapter[]> {
  const head = await src.read(0, 10);
  if (!isId3(head)) return [];
  const major = head[3];
  if (major !== 3 && major !== 4) return [];
  const flags = head[5];
  let tag = await src.read(10, syncsafe(head, 6));
  if (flags & 0x80 && major === 3) tag = unsync(tag);
  let start = 0;
  if (flags & 0x40) start = major === 4 ? syncsafe(tag, 0) : u32(tag, 0) + 4; // extended header
  const out: { start: number; end: number; title: string }[] = [];
  for (const f of frames(tag, start, tag.length, major)) {
    if (f.id !== 'CHAP') continue;
    const d = f.data;
    let o = d.indexOf(0);
    if (o < 0) continue;
    const elementId = decodeLatin1(d.subarray(0, o));
    o++;
    const startMs = u32(d, o);
    const endMs = u32(d, o + 4);
    o += 16;
    let title = '';
    for (const sub of frames(d, o, d.length, major)) {
      if (sub.id === 'TIT2' && sub.data.length > 0) title = decodeText(sub.data[0], sub.data.subarray(1));
    }
    out.push({ start: startMs / 1000, end: endMs / 1000, title: title || elementId });
  }
  return finishChapters(out, duration);
}
