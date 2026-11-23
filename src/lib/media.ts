/** Media items, file-type support and sidecar matching. */

export type MediaKind = 'audio' | 'video';

export interface MediaItem {
  /** Stable id for this session (folder path + name). */
  id: string;
  name: string;
  folder: string;
  size: number;
  kind: MediaKind;
  ext: string;
  getFile: () => Promise<File>;
  getChaptersVtt?: () => Promise<File>;
  getCaptionsVtt?: () => Promise<File>;
  /** Set when the item comes from app storage ("Keep in app"). */
  importedId?: string;
}

export const AUDIO_EXTS = ['m4b', 'm4a', 'mp3', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];
export const VIDEO_EXTS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv'];
export const MEDIA_EXTS = [...AUDIO_EXTS, ...VIDEO_EXTS];

/** `accept` for file inputs: media plus .vtt sidecars. */
export const FILE_ACCEPT = [
  'audio/*',
  'video/*',
  ...MEDIA_EXTS.map((e) => '.' + e),
  '.vtt',
  'text/vtt',
].join(',');

const MIME: Record<string, string> = {
  m4b: 'audio/mp4',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
};

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/** "book.chapters.vtt" → "book"; "book.m4b" → "book". */
export function baseOf(name: string): string {
  const lower = name.normalize('NFC');
  for (const suffix of ['.chapters.vtt', '.captions.vtt', '.subtitles.vtt']) {
    if (lower.toLowerCase().endsWith(suffix)) return lower.slice(0, -suffix.length);
  }
  const i = lower.lastIndexOf('.');
  return i < 0 ? lower : lower.slice(0, i);
}

export function isMediaName(name: string) {
  return MEDIA_EXTS.includes(extOf(name));
}

export function kindOf(name: string): MediaKind {
  return AUDIO_EXTS.includes(extOf(name)) ? 'audio' : 'video';
}

export function mimeOf(name: string): string {
  return MIME[extOf(name)] ?? '';
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let probe: HTMLVideoElement | null = null;
/** Returns null when the browser can probably play the file, otherwise a plain explanation. */
export function playabilityProblem(name: string): string | null {
  const ext = extOf(name);
  if (typeof document === 'undefined') return null;
  const ios = isIOS();
  const label = ext.toUpperCase() || 'this file type';
  if (ios && ['mkv', 'webm', 'ogg', 'oga', 'ogv', 'opus'].includes(ext)) return `iPhone can't play ${label} files.`;
  const mime = mimeOf(name);
  if (!mime) return `Unknown file type (${label}).`;
  probe ??= document.createElement('video');
  if (probe.canPlayType(mime) === '') {
    // Chrome plays many MKV files even though canPlayType says no; let it try.
    if (ext === 'mkv' && !ios) return null;
    return `${ios ? 'iPhone' : 'This browser'} can't play ${label} files.`;
  }
  return null;
}

export interface NamedFile {
  name: string;
  /** Folder path relative to the picked folder ('' for the root). */
  folder: string;
  size: number;
  get: () => Promise<File>;
}

/** Group media with their `<name>.chapters.vtt` / `<name>.captions.vtt` sidecars (same folder, same base). */
export function groupFiles(files: NamedFile[]): MediaItem[] {
  const key = (folder: string, base: string) => `${folder}\u0000${base.toLowerCase()}`;
  const chapters = new Map<string, NamedFile>();
  const captions = new Map<string, NamedFile>();
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.chapters.vtt')) chapters.set(key(f.folder, baseOf(f.name)), f);
    else if (lower.endsWith('.captions.vtt') || lower.endsWith('.subtitles.vtt')) captions.set(key(f.folder, baseOf(f.name)), f);
  }
  // A plain "<name>.vtt" counts as captions if nothing more specific exists.
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.vtt') && !lower.endsWith('.chapters.vtt') && !lower.endsWith('.captions.vtt') && !lower.endsWith('.subtitles.vtt')) {
      const k = key(f.folder, baseOf(f.name));
      if (!captions.has(k)) captions.set(k, f);
    }
  }
  const items: MediaItem[] = [];
  for (const f of files) {
    if (!isMediaName(f.name)) continue;
    const k = key(f.folder, baseOf(f.name));
    const ch = chapters.get(k);
    const cap = captions.get(k);
    items.push({
      id: `${f.folder}/${f.name}`,
      name: f.name,
      folder: f.folder,
      size: f.size,
      kind: kindOf(f.name),
      ext: extOf(f.name),
      getFile: f.get,
      getChaptersVtt: ch?.get,
      getCaptionsVtt: cap?.get,
    });
  }
  return items.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function fromFileList(list: Iterable<File>, folder = ''): MediaItem[] {
  return groupFiles(
    [...list].map((f) => ({
      name: f.name,
      folder: (f as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/').slice(0, -1).join('/') || folder,
      size: f.size,
      get: async () => f,
    })),
  );
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '?';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
