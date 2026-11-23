import type { ByteSource, ChapterResult } from './types';
import { isMp4, movieDuration, parseChapterTrack, parseChpl, readMoov } from './mp4';
import { isId3, parseId3Chapters } from './id3';
import { vttToChapters } from './vtt';

export * from './types';
export { parseVtt, vttToChapters, cueText } from './vtt';
export type { Cue } from './vtt';

/**
 * Load chapters in priority order:
 * sidecar VTT → Nero chpl → QuickTime chapter track → ID3 CHAP → none.
 */
export async function loadChapters(src: ByteSource, sidecarVtt?: string | null): Promise<ChapterResult> {
  let duration: number | undefined;
  const head = await src.read(0, 16);
  let moov: Uint8Array | null = null;
  try {
    if (isMp4(head)) {
      moov = await readMoov(src);
      if (moov) duration = movieDuration(moov);
    }
  } catch {
    moov = null;
  }

  if (sidecarVtt) {
    const chapters = vttToChapters(sidecarVtt);
    if (chapters.length) return { chapters, source: 'vtt', duration };
  }
  try {
    if (moov) {
      const chpl = parseChpl(moov, duration);
      if (chpl.length) return { chapters: chpl, source: 'chpl', duration };
      const qt = await parseChapterTrack(moov, src, duration);
      if (qt.length) return { chapters: qt, source: 'qt-track', duration };
    }
    if (isId3(head)) {
      const id3 = await parseId3Chapters(src, duration);
      if (id3.length) return { chapters: id3, source: 'id3', duration };
    }
  } catch (e) {
    console.warn('Chapter parsing failed', e);
  }
  return { chapters: [], source: 'none', duration };
}
