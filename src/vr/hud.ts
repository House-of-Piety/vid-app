/** In-VR HUD drawn into a 2D canvas (used as a texture). Buttons are configurable. */

export const HUD_W = 1024;
export const HUD_H = 320;
const BTN_TOP = 130;
const BTN_BOTTOM = 300;

export type HudIcon = 'prev' | 'next' | 'play' | 'pause' | 'recenter' | 'exit' | 'minus' | 'plus' | 'cycle';

export interface HudButtonSpec {
  id: string;
  label: string;
  icon: HudIcon;
}

export interface HudContent {
  title: string;
  /** 0..1, or undefined to hide the bar */
  progress?: number;
  buttons: HudButtonSpec[];
}

export interface HudDrawState extends HudContent {
  highlight: number;
  dwell: number;
}

/** Button index at HUD canvas coordinates, or -1. */
export function hudButtonAt(x: number, y: number, count: number): number {
  if (count <= 0 || y < BTN_TOP || y > BTN_BOTTOM || x < 0 || x > HUD_W) return -1;
  return Math.min(count - 1, Math.floor(x / (HUD_W / count)));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function icon(ctx: CanvasRenderingContext2D, kind: HudIcon, cx: number, cy: number) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const s = 26;
  const tri = (x0: number, dir: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(x0, cy - s);
    ctx.lineTo(x0 + dir * s * 1.5, cy);
    ctx.lineTo(x0, cy + s);
    ctx.closePath();
    ctx.fill();
  };
  switch (kind) {
    case 'prev':
      ctx.fillRect(cx - s - 6, cy - s, 8, s * 2);
      tri(cx + s * 0.9, -1);
      break;
    case 'next':
      ctx.fillRect(cx + s - 2, cy - s, 8, s * 2);
      tri(cx - s * 0.9, 1);
      break;
    case 'pause':
      ctx.fillRect(cx - 20, cy - s, 13, s * 2);
      ctx.fillRect(cx + 7, cy - s, 13, s * 2);
      break;
    case 'play':
      tri(cx - s * 0.6, 1);
      break;
    case 'recenter':
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'exit':
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.8, cy - s * 0.8);
      ctx.lineTo(cx + s * 0.8, cy + s * 0.8);
      ctx.moveTo(cx + s * 0.8, cy - s * 0.8);
      ctx.lineTo(cx - s * 0.8, cy + s * 0.8);
      ctx.stroke();
      break;
    case 'minus':
    case 'plus':
      ctx.beginPath();
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx + s, cy);
      if (kind === 'plus') {
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx, cy + s);
      }
      ctx.stroke();
      break;
    case 'cycle':
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.9, 0.3, Math.PI * 1.7);
      ctx.stroke();
      tri(cx + s * 0.55, 1);
      break;
  }
}

export function drawHud(canvas: HTMLCanvasElement, st: HudDrawState) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, HUD_W, HUD_H);
  ctx.fillStyle = 'rgba(16,16,18,0.88)';
  roundRect(ctx, 0, 0, HUD_W, HUD_H, 28);
  ctx.fill();
  ctx.fillStyle = '#ffad5c';
  ctx.font = '600 40px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let title = st.title || ' ';
  while (ctx.measureText(title).width > HUD_W - 80 && title.length > 2) title = title.slice(0, -2) + '…';
  ctx.fillText(title, HUD_W / 2, 52);
  if (st.progress !== undefined) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(40, 96, HUD_W - 80, 10);
    ctx.fillStyle = '#ff8a1f';
    ctx.fillRect(40, 96, (HUD_W - 80) * Math.min(1, Math.max(0, st.progress)), 10);
  }
  const n = st.buttons.length;
  const bw = HUD_W / Math.max(1, n);
  st.buttons.forEach((b, i) => {
    const x = i * bw + 10;
    const hl = i === st.highlight;
    ctx.fillStyle = hl ? 'rgba(255,138,31,0.28)' : 'rgba(255,255,255,0.07)';
    roundRect(ctx, x, BTN_TOP, bw - 20, BTN_BOTTOM - BTN_TOP, 18);
    ctx.fill();
    if (hl) {
      ctx.strokeStyle = '#ff8a1f';
      ctx.lineWidth = 5;
      ctx.stroke();
      if (st.dwell > 0) {
        ctx.fillStyle = '#ff8a1f';
        ctx.fillRect(x + 12, BTN_BOTTOM - 16, (bw - 44) * st.dwell, 8);
      }
    }
    icon(ctx, b.icon, x + (bw - 20) / 2, BTN_TOP + 58);
    ctx.fillStyle = '#ddd';
    ctx.font = '500 24px system-ui, -apple-system, sans-serif';
    let label = b.label;
    while (ctx.measureText(label).width > bw - 30 && label.length > 2) label = label.slice(0, -2) + '…';
    ctx.fillText(label, x + (bw - 20) / 2, BTN_TOP + 128);
  });
}

/** Gaze cursor: a ring with an optional dwell-progress arc. */
export function drawCursor(canvas: HTMLCanvasElement, progress: number, onTarget: boolean) {
  const ctx = canvas.getContext('2d')!;
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);
  ctx.lineWidth = s * 0.09;
  ctx.strokeStyle = onTarget ? 'rgba(255,173,92,0.95)' : 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * (onTarget ? 0.34 : 0.16), 0, Math.PI * 2);
  ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = '#ff8a1f';
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.42, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
}
