import { describe, expect, it } from 'vitest';
import { isFinished, normalizeName, resumeKey, resumePosition } from '../src/lib/resume';
import { chapterIndexAt, formatTime, nextChapterTime, prevChapterTime } from '../src/lib/chapterNav';

describe('resume key', () => {
  it('normalizes name, ignores path and case', () => {
    expect(resumeKey('C:\\Books\\My  Book.M4B', 1234, 3600.4)).toBe('my book.m4b|1234|3600');
    expect(resumeKey('My Book.m4b', 1234, 3599.6)).toBe(resumeKey('my book.m4b', 1234, 3600.2));
  });
  it('NFC-normalizes accents (decomposed vs composed)', () => {
    expect(normalizeName('Cancio\u0301n.mp3')).toBe(normalizeName('Canci\u00f3n.mp3'));
  });
  it('differs when size differs', () => {
    expect(resumeKey('a.mp3', 1, 10)).not.toBe(resumeKey('a.mp3', 2, 10));
  });
  it('handles unknown duration', () => {
    expect(resumeKey('a.mp3', 1, NaN)).toBe('a.mp3|1|0');
  });
});

describe('finished rules', () => {
  it('last 15 s counts as finished', () => {
    // 5-minute file: the 15 s rule applies before the 98% one
    expect(isFinished(300 - 14, 300)).toBe(true);
    expect(isFinished(300 - 16, 300)).toBe(false);
  });
  it('past 98% counts as finished', () => {
    expect(isFinished(99, 100)).toBe(true);
    expect(isFinished(84, 100)).toBe(false);
    expect(isFinished(86, 100)).toBe(true); // within 15 s
  });
  it('resume rewinds 3 s, clamps at 0, restarts when finished', () => {
    expect(resumePosition({ position: 754, finished: false }, 3600)).toBe(751);
    expect(resumePosition({ position: 1, finished: false }, 3600)).toBe(0);
    expect(resumePosition({ position: 754, finished: true }, 3600)).toBe(0);
    expect(resumePosition({ position: 3590, finished: false }, 3600)).toBe(0);
    expect(resumePosition(null, 3600)).toBe(0);
  });
});

describe('chapter navigation', () => {
  const ch = [
    { start: 0, end: 10, title: 'a' },
    { start: 10, end: 20, title: 'b' },
    { start: 20, end: 30, title: 'c' },
  ];
  it('current chapter', () => {
    expect(chapterIndexAt(ch, 0)).toBe(0);
    expect(chapterIndexAt(ch, 9.99)).toBe(0);
    expect(chapterIndexAt(ch, 10)).toBe(1);
    expect(chapterIndexAt(ch, 99)).toBe(2);
    expect(chapterIndexAt([], 5)).toBe(-1);
  });
  it('previous: restart chapter if more than 3 s in', () => {
    expect(prevChapterTime(ch, 14)).toBe(10);
    expect(prevChapterTime(ch, 13.5)).toBe(10);
  });
  it('previous: go to previous chapter within the first 3 s', () => {
    expect(prevChapterTime(ch, 12)).toBe(0);
    expect(prevChapterTime(ch, 10)).toBe(0);
    expect(prevChapterTime(ch, 1)).toBe(0);
  });
  it('next', () => {
    expect(nextChapterTime(ch, 5)).toBe(10);
    expect(nextChapterTime(ch, 25)).toBeNull();
  });
  it('formatTime', () => {
    expect(formatTime(754)).toBe('12:34');
    expect(formatTime(3754)).toBe('1:02:34');
  });
});
