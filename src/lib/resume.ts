/** Saved playback state for one file. */
export interface ResumeState {
  key: string;
  name: string;
  folder: string;
  /** File size in bytes (used to find the file again in a library). */
  size: number;
  position: number;
  duration: number;
  chapterIndex: number;
  chapterTitle: string;
  playbackRate: number;
  volume: number;
  updatedAt: number;
  finished: boolean;
  /** Id of the imported library item, if the file was kept in app. */
  importedId?: string;
}

/** Seconds rewound when resuming, for context. */
export const RESUME_REWIND = 3;
/** Within this many seconds of the end, the file counts as finished. */
export const FINISH_TAIL = 15;
/** Past this fraction of the duration, the file counts as finished. */
export const FINISH_FRACTION = 0.98;

/** Lower-case, NFC, collapse whitespace; strip any path. */
export function normalizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * File identity: normalized name + size in bytes + rounded duration.
 * `lastModified` is deliberately not used: it changes when files are copied between devices.
 */
export function resumeKey(name: string, size: number, duration: number): string {
  const d = Number.isFinite(duration) ? Math.round(duration) : 0;
  return `${normalizeName(name)}|${size}|${d}`;
}

export function isFinished(position: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return position >= duration - FINISH_TAIL || position / duration >= FINISH_FRACTION;
}

/** Where to start playback for a saved state (0 when finished or unknown). */
export function resumePosition(saved: Pick<ResumeState, 'position' | 'finished'> | null | undefined, duration: number): number {
  if (!saved || saved.finished) return 0;
  if (Number.isFinite(duration) && duration > 0 && isFinished(saved.position, duration)) return 0;
  return Math.max(0, saved.position - RESUME_REWIND);
}
