import type { ByteSource, Chapter } from './types';
import { finishChapters } from './types';
import { decodeUtf16, decodeUtf8 } from './text';

interface Box {
  type: string;
  /** offset of the payload within the buffer */
  start: number;
  /** end offset (exclusive) */
  end: number;
}

const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u64 = (view: DataView, o: number) => view.getUint32(o) * 0x100000000 + view.getUint32(o + 4);

/** Iterate child boxes inside buf[start, end). Handles 64-bit and to-end sizes. */
export function* boxes(buf: Uint8Array, start = 0, end = buf.length): Generator<Box> {
  const view = dv(buf);
  let o = start;
  while (o + 8 <= end) {
    let size = view.getUint32(o);
    const type = fourcc(buf, o + 4);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) return;
      size = u64(view, o + 8);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) return;
    yield { type, start: o + header, end: o + size };
    o += size;
  }
}

function child(buf: Uint8Array, parent: Box | null, type: string): Box | undefined {
  for (const b of boxes(buf, parent?.start ?? 0, parent?.end ?? buf.length)) if (b.type === type) return b;
  return undefined;
}

function path(buf: Uint8Array, parent: Box | null, ...types: string[]): Box | undefined {
  let cur: Box | null = parent;
  for (const t of types) {
    const next = child(buf, cur, t);
    if (!next) return undefined;
    cur = next;
  }
  return cur ?? undefined;
}

/** Find and read only the `moov` box by walking top-level box headers (moov may be at the start or the end). */
export async function readMoov(src: ByteSource): Promise<Uint8Array | null> {
  let o = 0;
  while (o + 8 <= src.size) {
    const h = await src.read(o, 16);
    if (h.length < 8) return null;
    const view = dv(h);
    let size = view.getUint32(0);
    const type = fourcc(h, 4);
    let header = 8;
    if (size === 1) {
      if (h.length < 16) return null;
      size = u64(view, 8);
      header = 16;
    } else if (size === 0) size = src.size - o;
    if (size < header) return null;
    if (type === 'moov') return src.read(o + header, size - header);
    o += size;
  }
  return null;
}

export function isMp4(head: Uint8Array): boolean {
  if (head.length < 8) return false;
  return ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(fourcc(head, 4));
}

/** Movie duration in seconds from mvhd. */
export function movieDuration(moov: Uint8Array): number | undefined {
  const mvhd = child(moov, null, 'mvhd');
  if (!mvhd) return undefined;
  const view = dv(moov);
  if (moov[mvhd.start] === 1) {
    const ts = view.getUint32(mvhd.start + 20);
    return ts ? u64(view, mvhd.start + 24) / ts : undefined;
  }
  const ts = view.getUint32(mvhd.start + 12);
  return ts ? view.getUint32(mvhd.start + 16) / ts : undefined;
}

/** Nero chapters: moov/udta/chpl. Start times are in 100 ns units. */
export function parseChpl(moov: Uint8Array, duration?: number): Chapter[] {
  const chpl = path(moov, null, 'udta', 'chpl');
  if (!chpl) return [];
  const view = dv(moov);
  let o = chpl.start;
  const version = moov[o];
  o += 4; // version + flags
  if (version === 1) o += 4; // reserved
  if (o >= chpl.end) return [];
  const count = moov[o++];
  const out: { start: number; title: string }[] = [];
  for (let i = 0; i < count && o + 9 <= chpl.end; i++) {
    const t100ns = u64(view, o);
    o += 8;
    const len = moov[o++];
    out.push({ start: t100ns / 1e7, title: decodeUtf8(moov.subarray(o, Math.min(o + len, chpl.end))) });
    o += len;
  }
  return finishChapters(out, duration);
}

function trackId(moov: Uint8Array, trak: Box): number {
  const tkhd = child(moov, trak, 'tkhd');
  if (!tkhd) return -1;
  return dv(moov).getUint32(tkhd.start + (moov[tkhd.start] === 1 ? 20 : 12));
}

/** Sample table of a track: per-sample time/duration (s), file offset and size. */
function sampleTable(moov: Uint8Array, trak: Box) {
  const view = dv(moov);
  const mdhd = path(moov, trak, 'mdia', 'mdhd');
  const stbl = path(moov, trak, 'mdia', 'minf', 'stbl');
  if (!mdhd || !stbl) return null;
  const timescale = view.getUint32(mdhd.start + (moov[mdhd.start] === 1 ? 20 : 12));
  if (!timescale) return null;
  const stts = child(moov, stbl, 'stts');
  const stsz = child(moov, stbl, 'stsz');
  const stsc = child(moov, stbl, 'stsc');
  const stco = child(moov, stbl, 'stco');
  const co64 = child(moov, stbl, 'co64');
  if (!stts || !stsz || !stsc || (!stco && !co64)) return null;

  const times: number[] = [];
  const durs: number[] = [];
  let t = 0;
  const sttsCount = view.getUint32(stts.start + 4);
  for (let i = 0; i < sttsCount; i++) {
    const n = view.getUint32(stts.start + 8 + i * 8);
    const d = view.getUint32(stts.start + 12 + i * 8);
    for (let k = 0; k < n; k++) {
      times.push(t / timescale);
      durs.push(d / timescale);
      t += d;
    }
  }

  const fixedSize = view.getUint32(stsz.start + 4);
  const sampleCount = view.getUint32(stsz.start + 8);
  const sizes: number[] = [];
  for (let i = 0; i < sampleCount; i++) sizes.push(fixedSize || view.getUint32(stsz.start + 12 + i * 4));

  const chunkOffsets: number[] = [];
  if (stco) {
    const n = view.getUint32(stco.start + 4);
    for (let i = 0; i < n; i++) chunkOffsets.push(view.getUint32(stco.start + 8 + i * 4));
  } else if (co64) {
    const n = view.getUint32(co64.start + 4);
    for (let i = 0; i < n; i++) chunkOffsets.push(u64(view, co64.start + 8 + i * 8));
  }

  const stscCount = view.getUint32(stsc.start + 4);
  const entries: { first: number; per: number }[] = [];
  for (let i = 0; i < stscCount; i++) {
    entries.push({ first: view.getUint32(stsc.start + 8 + i * 12), per: view.getUint32(stsc.start + 12 + i * 12) });
  }
  const offsets: number[] = [];
  let s = 0;
  for (let c = 0; c < chunkOffsets.length && s < sampleCount; c++) {
    let per = 0;
    for (const e of entries) {
      if (e.first <= c + 1) per = e.per;
      else break;
    }
    let off = chunkOffsets[c];
    for (let k = 0; k < per && s < sampleCount; k++) {
      offsets.push(off);
      off += sizes[s];
      s++;
    }
  }
  return { n: Math.min(sampleCount, offsets.length, times.length), times, durs, sizes, offsets };
}

/** QuickTime chapter track: tref/chap → text track; titles read from the samples via the ByteSource. */
export async function parseChapterTrack(moov: Uint8Array, src: ByteSource, duration?: number): Promise<Chapter[]> {
  const root: Box = { type: 'moov', start: 0, end: moov.length };
  const traks = [...boxes(moov, root.start, root.end)].filter((b) => b.type === 'trak').map((trak) => ({ trak, id: trackId(moov, trak) }));
  const view = dv(moov);
  const chapIds = new Set<number>();
  for (const { trak } of traks) {
    const chap = path(moov, trak, 'tref', 'chap');
    if (!chap) continue;
    for (let o = chap.start; o + 4 <= chap.end; o += 4) chapIds.add(view.getUint32(o));
  }
  const target = traks.find((t) => chapIds.has(t.id));
  if (!target) return [];
  const table = sampleTable(moov, target.trak);
  if (!table || table.n === 0) return [];
  const out: { start: number; end: number; title: string }[] = [];
  for (let i = 0; i < table.n; i++) {
    const size = table.sizes[i];
    let title = '';
    if (size >= 2) {
      const data = await src.read(table.offsets[i], Math.min(size, 4096));
      const len = Math.min((data[0] << 8) | data[1], data.length - 2);
      const raw = data.subarray(2, 2 + len);
      const bom = raw.length >= 2 && ((raw[0] === 0xfe && raw[1] === 0xff) || (raw[0] === 0xff && raw[1] === 0xfe));
      title = bom ? decodeUtf16(raw) : decodeUtf8(raw);
    }
    out.push({ start: table.times[i], end: table.times[i] + table.durs[i], title });
  }
  return finishChapters(out, duration);
}
