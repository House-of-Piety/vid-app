import { describe, expect, it } from 'vitest';
import { openAsBlob } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blobSource, loadChapters, parseVtt, vttToChapters } from '../src/lib/chapters';
import { movieDuration, parseChapterTrack, parseChpl, readMoov } from '../src/lib/chapters/mp4';
import { parseId3Chapters } from '../src/lib/chapters/id3';
import type { ByteSource, Chapter } from '../src/lib/chapters/types';

const FIX = join(__dirname, 'fixtures');
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8')) as {
  duration: number;
  chapters: { start: number; end: number; title: string }[];
};

async function src(name: string): Promise<ByteSource> {
  return blobSource(await openAsBlob(join(FIX, name)));
}

/** Track every read so we can assert nothing loads the whole file. */
function spy(s: ByteSource) {
  let maxRead = 0;
  return {
    src: { size: s.size, read: (o: number, l: number) => { maxRead = Math.max(maxRead, l); return s.read(o, l); } } as ByteSource,
    get maxRead() { return maxRead; },
  };
}

function expectChapters(chs: Chapter[]) {
  expect(chs.map((c) => c.title)).toEqual(expected.chapters.map((c) => c.title));
  chs.forEach((c, i) => {
    expect(Math.round(c.start * 1000)).toBe(expected.chapters[i].start);
    expect(Math.round(c.end * 1000)).toBe(expected.chapters[i].end);
  });
}

const MP4S = ['sample.m4b', 'sample.mp4', 'sample-moov-at-end.mp4'];

describe('MP4 chpl (Nero)', () => {
  for (const f of MP4S) {
    it(f, async () => {
      const moov = (await readMoov(await src(f)))!;
      expect(moov).toBeTruthy();
      expectChapters(parseChpl(moov, movieDuration(moov)));
    });
  }
});

describe('MP4 QuickTime chapter track', () => {
  for (const f of MP4S) {
    it(f, async () => {
      const s = await src(f);
      const moov = (await readMoov(s))!;
      expectChapters(await parseChapterTrack(moov, s, movieDuration(moov)));
    });
  }
});

describe('MP4 duration', () => {
  for (const f of MP4S) {
    it(f, async () => {
      const moov = (await readMoov(await src(f)))!;
      expect(movieDuration(moov)).toBeCloseTo(expected.duration, 1);
    });
  }
});

describe('ID3 CHAP', () => {
  it('sample.mp3', async () => {
    expectChapters(await parseId3Chapters(await src('sample.mp3')));
  });
  it('returns nothing for non-ID3 files', async () => {
    expect(await parseId3Chapters(await src('sample.m4b'))).toEqual([]);
  });
});

describe('WebVTT', () => {
  it('sidecar chapters', () => {
    expectChapters(vttToChapters(readFileSync(join(FIX, 'sample.chapters.vtt'), 'utf8')));
  });
  it('captions with markup, CRLF and BOM', () => {
    const cues = parseVtt('﻿WEBVTT\r\n\r\n00:01.500 --> 00:02.250 align:start\r\n<v Ana>Hola — señor</v>\r\nline 2\r\n\r\n01:00:00.000 --> 01:00:01.000\r\nlate\r\n');
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1.5, end: 2.25, text: '<v Ana>Hola — señor</v>\nline 2' });
    expect(cues[1].start).toBe(3600);
  });
  it('captions fixture', () => {
    const cues = parseVtt(readFileSync(join(FIX, 'sample.captions.vtt'), 'utf8'));
    expect(cues.map((c) => c.text)).toEqual(['Hello and welcome.', 'This is the second line — con ñ.']);
  });
});

describe('loadChapters priority', () => {
  it('sidecar VTT wins', async () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:06.000\nOnly one\n';
    const r = await loadChapters(await src('sample.m4b'), vtt);
    expect(r.source).toBe('vtt');
    expect(r.chapters.map((c) => c.title)).toEqual(['Only one']);
  });
  it('chpl before QuickTime track', async () => {
    const r = await loadChapters(await src('sample.m4b'));
    expect(r.source).toBe('chpl');
    expectChapters(r.chapters);
  });
  it('moov at end', async () => {
    const s = spy(await src('sample-moov-at-end.mp4'));
    const r = await loadChapters(s.src);
    expect(r.source).toBe('chpl');
    expectChapters(r.chapters);
    expect(s.maxRead).toBeLessThan(s.src.size); // never the whole file
  });
  it('mp3 via ID3', async () => {
    const r = await loadChapters(await src('sample.mp3'));
    expect(r.source).toBe('id3');
    expectChapters(r.chapters);
  });
  it('no chapters', async () => {
    const r = await loadChapters(await src('nochapters.m4a'));
    expect(r.source).toBe('none');
    expect(r.chapters).toEqual([]);
  });
});
