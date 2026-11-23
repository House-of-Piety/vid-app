import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import type { ResumeState } from './resume';

/**
 * Resume state lives in IndexedDB. A synchronous localStorage copy is also written so that a
 * save from `pagehide` survives even if the IndexedDB transaction is cut short. On read, the
 * newer of the two wins.
 */
const LS_PREFIX = 'cp.resume.';

function lsRead(key: string): ResumeState | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as ResumeState) : null;
  } catch {
    return null;
  }
}

function newer(a: ResumeState | null | undefined, b: ResumeState | null | undefined): ResumeState | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export async function getResume(key: string): Promise<ResumeState | null> {
  let fromDb: ResumeState | undefined;
  try {
    fromDb = await idbGet<ResumeState>('resume', key);
  } catch {
    /* ignore */
  }
  return newer(fromDb, lsRead(key));
}

export function saveResume(state: ResumeState): Promise<void> {
  try {
    localStorage.setItem(LS_PREFIX + state.key, JSON.stringify(state));
  } catch {
    /* quota or private mode */
  }
  return idbPut('resume', state).catch(() => undefined);
}

export async function listResume(): Promise<ResumeState[]> {
  const map = new Map<string, ResumeState>();
  try {
    for (const s of await idbGetAll<ResumeState>('resume')) map.set(s.key, s);
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(LS_PREFIX)) continue;
      const s = lsRead(k.slice(LS_PREFIX.length));
      if (s) map.set(s.key, newer(map.get(s.key), s)!);
    }
  } catch {
    /* ignore */
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteResume(key: string): Promise<void> {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* ignore */
  }
  await idbDelete('resume', key).catch(() => undefined);
}
