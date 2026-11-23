import type { Chapter } from './chapters/types';

/** Index of the chapter that contains `t`, or -1 when there are no chapters. */
export function chapterIndexAt(chapters: Chapter[], t: number): number {
  if (!chapters.length) return -1;
  let idx = 0;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].start <= t + 0.001) idx = i;
    else break;
  }
  return idx;
}

/** Seconds into the current chapter after which "previous" restarts the chapter instead. */
export const PREV_RESTART_THRESHOLD = 3;

/** Target time for "previous chapter". */
export function prevChapterTime(chapters: Chapter[], t: number): number {
  if (!chapters.length) return 0;
  const i = chapterIndexAt(chapters, t);
  const cur = chapters[i];
  if (t - cur.start > PREV_RESTART_THRESHOLD || i === 0) return cur.start;
  return chapters[i - 1].start;
}

/** Target time for "next chapter", or null when already in the last chapter. */
export function nextChapterTime(chapters: Chapter[], t: number): number | null {
  if (!chapters.length) return null;
  const i = chapterIndexAt(chapters, t);
  return i + 1 < chapters.length ? chapters[i + 1].start : null;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
