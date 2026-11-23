/** "Open folder" library for Chrome/Edge (File System Access API). */
import { kvGet, kvSet } from './idb';
import { groupFiles, type MediaItem, type NamedFile, isMediaName } from './media';

type PermState = 'granted' | 'denied' | 'prompt';
interface PermHandle extends FileSystemDirectoryHandle {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

const HANDLE_KEY = 'libraryDir';

export const canPickFolder = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const dir = await window.showDirectoryPicker!({ id: 'chapter-player', mode: 'read' });
  await kvSet(HANDLE_KEY, dir).catch(() => undefined);
  return dir;
}

export async function savedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await kvGet<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetFolder() {
  await kvSet(HANDLE_KEY, null);
}

export async function folderPermission(dir: FileSystemDirectoryHandle, request = false): Promise<PermState> {
  const h = dir as PermHandle;
  if (!h.queryPermission) return 'granted';
  let state = await h.queryPermission({ mode: 'read' });
  if (state !== 'granted' && request && h.requestPermission) state = await h.requestPermission({ mode: 'read' });
  return state;
}

/** Recursively scan a folder for media and .vtt sidecars. */
export async function scanFolder(dir: FileSystemDirectoryHandle, maxDepth = 8): Promise<MediaItem[]> {
  const found: NamedFile[] = [];
  async function walk(d: FileSystemDirectoryHandle, path: string, depth: number) {
    for await (const entry of d.values()) {
      if (entry.kind === 'directory') {
        if (depth < maxDepth && !entry.name.startsWith('.')) await walk(entry as FileSystemDirectoryHandle, path ? `${path}/${entry.name}` : entry.name, depth + 1);
      } else {
        const lower = entry.name.toLowerCase();
        if (!isMediaName(entry.name) && !lower.endsWith('.vtt')) continue;
        const fh = entry as FileSystemFileHandle;
        const file = await fh.getFile();
        found.push({ name: entry.name, folder: path, size: file.size, get: () => fh.getFile() });
      }
    }
  }
  await walk(dir, '', 0);
  return groupFiles(found);
}
