// Draws the app icon (original design: play triangle over a timeline with chapter marks)
// as SVG + PNGs. Run: npm run icons
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const out = join(process.cwd(), 'public');
const BG = '#161616';
const ORANGE = '#ff8a1f';
const TRACK = '#3a3a3a';
const TICK = '#ececec';

// Geometry in a 512×512 box.
const shapes = [
  { kind: 'tri', pts: [[196, 124], [196, 316], [364, 220]], color: ORANGE },
  { kind: 'rect', x: 104, y: 372, w: 304, h: 22, r: 11, color: TRACK },
  { kind: 'rect', x: 104, y: 372, w: 150, h: 22, r: 11, color: ORANGE },
  { kind: 'rect', x: 176, y: 352, w: 10, h: 62, r: 5, color: TICK },
  { kind: 'rect', x: 286, y: 352, w: 10, h: 62, r: 5, color: TICK },
  { kind: 'rect', x: 352, y: 352, w: 10, h: 62, r: 5, color: TICK },
];

function svg() {
  const parts = shapes.map((s) =>
    s.kind === 'tri'
      ? `<polygon points="${s.pts.map((p) => p.join(',')).join(' ')}" fill="${s.color}" stroke="${s.color}" stroke-width="16" stroke-linejoin="round"/>`
      : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" fill="${s.color}"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BG}"/>${parts.join('')}</svg>\n`;
}

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inTri(px, py, pts, round = 8) {
  const [a, b, c] = pts;
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const P = [px, py];
  const d1 = s(P, a, b), d2 = s(P, b, c), d3 = s(P, c, a);
  const inside = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  if (inside) return true;
  return Math.min(distToSegment(px, py, a, b), distToSegment(px, py, b, c), distToSegment(px, py, c, a)) <= round;
}

/** size: output px; scale: content scale (maskable uses 0.8); roundBg: rounded background corners. */
function png(size, { scale = 1, roundBg = true } = {}) {
  const img = new PNG({ width: size, height: size });
  const SS = 4;
  const bg = hex(BG);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 512;
          const v = ((y + (sy + 0.5) / SS) / size) * 512;
          if (roundBg && !inRoundRect(u, v, 0, 0, 512, 512, 112)) continue;
          // content coordinates (scaled around the centre)
          const cu = (u - 256) / scale + 256;
          const cv = (v - 256) / scale + 256;
          let col = bg;
          for (const s of shapes) {
            const hit = s.kind === 'tri' ? inTri(cu, cv, s.pts) : inRoundRect(cu, cv, s.x, s.y, s.w, s.h, s.r);
            if (hit) col = hex(s.color);
          }
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / n;
      img.data[i] = cov ? (r / n) * (255 / cov) : 0;
      img.data[i + 1] = cov ? (g / n) * (255 / cov) : 0;
      img.data[i + 2] = cov ? (b / n) * (255 / cov) : 0;
      img.data[i + 3] = cov;
    }
  }
  return PNG.sync.write(img);
}

writeFileSync(join(out, 'favicon.svg'), svg());
writeFileSync(join(out, 'icon-192.png'), png(192));
writeFileSync(join(out, 'icon-512.png'), png(512));
writeFileSync(join(out, 'icon-maskable-512.png'), png(512, { scale: 0.78, roundBg: false }));
// iOS adds its own rounded mask, so the touch icon is full-bleed.
writeFileSync(join(out, 'apple-touch-icon.png'), png(180, { scale: 0.9, roundBg: false }));
console.log('Icons written to', out);
