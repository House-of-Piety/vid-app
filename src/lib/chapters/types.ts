/** A chapter, times in seconds. */
export interface Chapter {
  start: number;
  end: number;
  title: string;
}

export type ChapterSource = 'vtt' | 'chpl' | 'qt-track' | 'id3' | 'none';

export interface ChapterResult {
  chapters: Chapter[];
  source: ChapterSource;
  /** Duration found in the container, if any (seconds). */
  duration?: number;
}

/** Minimal random-access reader over a Blob (never loads the whole file). */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      const end = Math.min(blob.size, offset + length);
      if (offset >= end) return new Uint8Array(0);
      return new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    },
  };
}

/** Sort and fill in end times from the next chapter's start, the stated end, or the duration. */
export function finishChapters(list: { start: number; end?: number; title: string }[], duration?: number): Chapter[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  return sorted.map((c, i) => {
    const next = sorted[i + 1];
    let end: number;
    if (next) end = next.start;
    else if (duration && duration > c.start) end = duration;
    else end = c.end ?? c.start;
    return { start: c.start, end: Math.max(end, c.start), title: c.title.trim() || `Chapter ${i + 1}` };
  });
}
