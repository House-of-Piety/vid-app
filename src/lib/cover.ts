/** Generated cover art for audio files (no images needed). */

export function hashHue(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function displayTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/**
 * Draws the cover (title, chapter, caption, progress) into a canvas; used as the VR texture for audio.
 */
export function drawCover(
  canvas: HTMLCanvasElement,
  opts: { title: string; chapter: string; caption: string; progress: number },
) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const hue = hashHue(opts.title);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue} 45% 22%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360} 50% 10%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(h * 0.09)}px system-ui, -apple-system, sans-serif`;
  const titleLines = wrapLines(ctx, opts.title, w * 0.86, 2);
  titleLines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.26 + i * h * 0.11));
  ctx.fillStyle = '#ffad5c';
  ctx.font = `500 ${Math.round(h * 0.065)}px system-ui, -apple-system, sans-serif`;
  wrapLines(ctx, opts.chapter, w * 0.86, 2).forEach((l, i) => ctx.fillText(l, w / 2, h * 0.53 + i * h * 0.08));
  if (opts.caption) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(w * 0.05, h * 0.68, w * 0.9, h * 0.2);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = `${Math.round(h * 0.055)}px system-ui, -apple-system, sans-serif`;
    wrapLines(ctx, opts.caption, w * 0.84, 2).forEach((l, i) => ctx.fillText(l, w / 2, h * 0.74 + i * h * 0.075));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(w * 0.05, h * 0.93, w * 0.9, h * 0.012);
  ctx.fillStyle = '#ff8a1f';
  ctx.fillRect(w * 0.05, h * 0.93, w * 0.9 * Math.min(1, Math.max(0, opts.progress)), h * 0.012);
}
