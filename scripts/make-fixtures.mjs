// Generates the small test fixtures in tests/fixtures/ with ffmpeg.
// Run: npm run fixtures   (needs ffmpeg on PATH)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });

// Expected values, shared with the tests via fixtures/expected.json
const chapters = [
  { start: 0, end: 2000, title: 'Intro; the start = #1' },
  { start: 2000, end: 4500, title: 'Canción del ñandú — parte dos' },
  { start: 4500, end: 6000, title: 'Épilogue = fin; #3' },
];
const DUR = 6;

// ffmetadata needs '=', ';', '#', '\' and newlines escaped with a backslash.
const esc = (s) => s.replace(/([=;#\\n])/g, '\$1');
let meta = ';FFMETADATA1\ntitle=Chapter Player fixture\nartist=Fixture\n';
for (const c of chapters) {
  meta += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${c.start}\nEND=${c.end}\ntitle=${esc(c.title)}\n`;
}
const metaPath = join(dir, 'chapters.ffmeta');
writeFileSync(metaPath, meta, 'utf8');

const ts = (ms) => {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
let vtt = 'WEBVTT\n\n';
chapters.forEach((c, i) => { vtt += `chapter-${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.title}\n\n`; });
writeFileSync(join(dir, 'sample.chapters.vtt'), vtt, 'utf8');
writeFileSync(join(dir, 'sample.captions.vtt'),
  'WEBVTT\n\n00:00:00.500 --> 00:00:01.900\nHello and welcome.\n\n00:00:02.100 --> 00:00:04.000\nThis is the second line — con ñ.\n', 'utf8');
writeFileSync(join(dir, 'expected.json'), JSON.stringify({ duration: DUR, chapters }, null, 2) + '\n', 'utf8');

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const sine = ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${DUR}`];
const video = ['-f', 'lavfi', '-i', `testsrc2=size=160x90:rate=15:duration=${DUR}`];

ff([...sine, '-i', metaPath, '-map', '0:a', '-map_metadata', '1', '-map_chapters', '1', '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', join(dir, 'sample.m4b')]);
ff([...video, ...sine, '-i', metaPath, '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '35', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', join(dir, 'sample.mp4')]);
ff([...video, ...sine, '-i', metaPath, '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '35', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k', join(dir, 'sample-moov-at-end.mp4')]);
ff([...sine, '-i', metaPath, '-map', '0:a', '-map_metadata', '1', '-map_chapters', '1', '-c:a', 'libmp3lame', '-b:a', '32k', '-id3v2_version', '3', join(dir, 'sample.mp3')]);
// A file with no chapters at all
ff([...sine, '-map', '0:a', '-c:a', 'aac', '-b:a', '32k', join(dir, 'nochapters.m4a')]);
console.log('Fixtures written to', dir);
