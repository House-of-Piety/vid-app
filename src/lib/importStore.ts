/**
 * "Keep in app": copies a media file and its sidecars into app storage.
 *
 * Backend choice (see CLAUDE.md for the support findings):
 *  1. OPFS + `createWritable()` on the main thread (Chrome/Edge, Safari 26+).
 *  2. OPFS + `createSyncAccessHandle()` in a worker (Safari 15.2–18.x).
 *  3. IndexedDB Blobs (anything else).
 */
import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import { kindOf, extOf, type MediaItem } from './media';

export type Backend = 'opfs' | 'opfs-worker' | 'idb';
type Role = 'media' | 'chapters' | 'captions';

export interface ImportedFile {
  role: Role;
  name: string;
  size: number;
  type: string;
}

export interface ImportedItem {
  id: string;
  name: string;
  folder: string;
  size: number;
  addedAt: number;
  backend: Backend;
  files: ImportedFile[];
}

const ROOT = 'imports';

async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await navigator.storage?.getDirectory?.()) ?? null;
  } catch {
    return null;
  }
}

let backendPromise: Promise<Backend> | null = null;
export function detectBackend(): Promise<Backend> {
  backendPromise ??= (async () => {
    const root = await opfsRoot();
    if (!root) return 'idb';
    const proto = (globalThis as unknown as { FileSystemFileHandle?: { prototype: object } }).FileSystemFileHandle?.prototype;
    if (proto && 'createWritable' in proto) return 'opfs';
    if (proto && 'createSyncAccessHandle' in proto && typeof Worker !== 'undefined') return 'opfs-worker';
    return 'idb';
  })();
  return backendPromise;
}

let worker: Worker | null = null;
let msgId = 0;
function workerWrite(dir: string, name: string, file: File, onProgress?: (p: number) => void): Promise<void> {
  worker ??= new Worker(new URL('./opfsWorker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ id: number; done?: boolean; error?: string; progress?: number }>) => {
      if (e.data.id !== id) return;
      if (e.data.progress !== undefined) onProgress?.(e.data.progress);
      if (e.data.done) {
        w.removeEventListener('message', onMsg);
        resolve();
      } else if (e.data.error) {
        w.removeEventListener('message', onMsg);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, dir, name, file });
  });
}

async function itemDir(id: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = (await opfsRoot())!;
  const imports = await root.getDirectoryHandle(ROOT, { create });
  return imports.getDirectoryHandle(id, { create });
}

async function writeOne(backend: Backend, id: string, role: Role, file: File, onProgress?: (p: number) => void) {
  const storedName = `${role}.${extOf(file.name) || 'bin'}`;
  if (backend === 'opfs') {
    const dir = await itemDir(id, true);
    const fh = await dir.getFileHandle(storedName, { create: true });
    const writable = await (fh as unknown as { createWritable(): Promise<WritableStream & { close(): Promise<void> }> }).createWritable();
    let written = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        written += chunk.byteLength;
        onProgress?.(file.size ? written / file.size : 1);
        ctl.enqueue(chunk);
      },
    });
    await file.stream().pipeThrough(counter).pipeTo(writable);
  } else if (backend === 'opfs-worker') {
    await workerWrite(`${ROOT}/${id}`, storedName, file, onProgress);
  } else {
    // Store a Blob copy; WebKit/Chromium keep Blobs on disk, not in memory.
    await idbPut('importBlobs', new Blob([file], { type: file.type }), `${id}/${role}`);
    onProgress?.(1);
  }
}

async function readOne(item: ImportedItem, role: Role): Promise<File> {
  const meta = item.files.find((f) => f.role === role);
  if (!meta) throw new Error(`No ${role} file`);
  if (item.backend === 'idb') {
    const blob = await idbGet<Blob>('importBlobs', `${item.id}/${role}`);
    if (!blob) throw new Error('Imported file is missing');
    return new File([blob], meta.name, { type: meta.type });
  }
  const dir = await itemDir(item.id, false);
  const fh = await dir.getFileHandle(`${role}.${extOf(meta.name) || 'bin'}`);
  const f = await fh.getFile();
  return new File([f], meta.name, { type: meta.type || f.type });
}

export async function importItem(media: MediaItem, onProgress?: (p: number) => void): Promise<ImportedItem> {
  const backend = await detectBackend();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const parts: { role: Role; file: File }[] = [{ role: 'media', file: await media.getFile() }];
  if (media.getChaptersVtt) parts.push({ role: 'chapters', file: await media.getChaptersVtt() });
  if (media.getCaptionsVtt) parts.push({ role: 'captions', file: await media.getCaptionsVtt() });
  const total = parts.reduce((s, p) => s + p.file.size, 0) || 1;
  let done = 0;
  try {
    for (const p of parts) {
      await writeOne(backend, id, p.role, p.file, (f) => onProgress?.((done + f * p.file.size) / total));
      done += p.file.size;
    }
  } catch (e) {
    await removeData({ id, backend, files: parts.map((p) => ({ role: p.role })) as ImportedFile[] } as ImportedItem).catch(() => undefined);
    throw e;
  }
  const item: ImportedItem = {
    id,
    name: media.name,
    folder: media.folder,
    size: parts[0].file.size,
    addedAt: Date.now(),
    backend,
    files: parts.map((p) => ({ role: p.role, name: p.file.name, size: p.file.size, type: p.file.type })),
  };
  await idbPut('imports', item);
  void requestPersist();
  return item;
}

async function removeData(item: ImportedItem) {
  if (item.backend === 'idb') {
    for (const f of item.files) await idbDelete('importBlobs', `${item.id}/${f.role}`);
  } else {
    const root = await opfsRoot();
    const imports = await root?.getDirectoryHandle(ROOT, { create: false }).catch(() => null);
    await imports?.removeEntry(item.id, { recursive: true }).catch(() => undefined);
  }
}

export async function deleteImported(item: ImportedItem) {
  await removeData(item);
  await idbDelete('imports', item.id);
}

export async function listImported(): Promise<ImportedItem[]> {
  try {
    return (await idbGetAll<ImportedItem>('imports')).sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function getImported(id: string): Promise<ImportedItem | undefined> {
  return idbGet<ImportedItem>('imports', id);
}

export function importedToMedia(item: ImportedItem): MediaItem {
  const has = (r: Role) => item.files.some((f) => f.role === r);
  return {
    id: `imported:${item.id}`,
    name: item.name,
    folder: item.folder,
    size: item.size,
    kind: kindOf(item.name),
    ext: extOf(item.name),
    getFile: () => readOne(item, 'media'),
    getChaptersVtt: has('chapters') ? () => readOne(item, 'chapters') : undefined,
    getCaptionsVtt: has('captions') ? () => readOne(item, 'captions') : undefined,
    importedId: item.id,
  };
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function requestPersist(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
