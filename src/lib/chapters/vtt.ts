import type { Chapter } from './types';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(s: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(s.trim());
  if (!m) return null;
  const [, h, mi, se, ms] = m;
  return Number(h ?? 0) * 3600 + Number(mi) * 60 + Number(se) + Number(ms.padEnd(3, '0')) / 1000;
}

/** Parse WebVTT text into cues. Tolerates SRT-style commas and a missing header. */
export function parseVtt(text: string): Cue[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const arrow = line.indexOf('-->');
    if (arrow < 0) {
      i++;
      continue;
    }
    const start = parseTimestamp(line.slice(0, arrow));
    const end = parseTimestamp(line.slice(arrow + 3).trim().split(/\s+/)[0] ?? '');
    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }
    if (start !== null && end !== null) cues.push({ start, end, text: textLines.join('\n') });
  }
  return cues;
}

/** Strip simple VTT markup like <v Speaker>, <b>, <i>, and decode basic entities. */
export function cueText(t: string): string {
  return t
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function vttToChapters(text: string): Chapter[] {
  return parseVtt(text)
    .sort((a, b) => a.start - b.start)
    .map((c, i) => ({ start: c.start, end: c.end, title: cueText(c.text).trim() || `Chapter ${i + 1}` }));
}
