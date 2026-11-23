/// <reference lib="webworker" />
/**
 * OPFS writer for browsers that support `createSyncAccessHandle()` in workers but not
 * `createWritable()` on the main thread (Safari before 26). Copies a File in 4 MB slices.
 */
interface WriteMsg {
  id: number;
  dir: string;
  name: string;
  file: File;
}

interface SyncHandle {
  write(buf: Uint8Array, opts: { at: number }): number;
  truncate(n: number): void;
  flush(): void;
  close(): void;
}

const CHUNK = 4 * 1024 * 1024;

self.onmessage = async (e: MessageEvent<WriteMsg>) => {
  const { id, dir, name, file } = e.data;
  try {
    const root = await navigator.storage.getDirectory();
    let d = root;
    for (const part of dir.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create: true });
    const fh = await d.getFileHandle(name, { create: true });
    const handle = (await (fh as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle());
    try {
      handle.truncate(0);
      for (let at = 0; at < file.size; at += CHUNK) {
        const buf = new Uint8Array(await file.slice(at, at + CHUNK).arrayBuffer());
        handle.write(buf, { at });
        (self as unknown as Worker).postMessage({ id, progress: Math.min(1, (at + buf.length) / file.size) });
      }
      handle.flush();
    } finally {
      handle.close();
    }
    (self as unknown as Worker).postMessage({ id, done: true });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
