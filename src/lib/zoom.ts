/**
 * Pinch-zoom maths for the video (pure). Coordinates are CSS px relative to the stage centre.
 * The video element fills the stage with object-fit: contain; the zoom is applied as
 * `translate(x, y) scale(s)` with transform-origin at the centre.
 */
export interface Zoom {
  s: number;
  x: number;
  y: number;
}
export interface ZoomBox {
  /** stage size */
  w: number;
  h: number;
  /** picture size at scale 1 (object-fit: contain) */
  picW: number;
  picH: number;
}
export interface Pt {
  x: number;
  y: number;
}

export const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;

export function zoomBox(w: number, h: number, aspect: number): ZoomBox {
  const picW = Math.min(w, h * aspect);
  return { w, h, picW, picH: picW / aspect };
}

/** Scale at which the picture just fills the whole stage (like YouTube's "zoom to fill"). */
export function fillScale(b: ZoomBox): number {
  if (!b.picW || !b.picH) return 1;
  return Math.max(b.w / b.picW, b.h / b.picH);
}

/** Keep the scale in range and the picture covering as much of the stage as it can (no panning into black). */
export function clampZoom(z: Zoom, b: ZoomBox): Zoom {
  const s = Math.min(MAX_ZOOM, Math.max(1, z.s));
  const limX = Math.max(0, (s * b.picW - b.w) / 2);
  const limY = Math.max(0, (s * b.picH - b.h) / 2);
  return { s, x: Math.min(limX, Math.max(-limX, z.x)), y: Math.min(limY, Math.max(-limY, z.y)) };
}

/**
 * Two-finger pinch: `ratio` = current finger distance / start distance. The picture point that was
 * under the start midpoint m0 stays under the current midpoint m (so it also pans with two fingers).
 */
export function pinchZoom(start: Zoom, m0: Pt, m: Pt, ratio: number, b: ZoomBox): Zoom {
  const s = Math.min(MAX_ZOOM, Math.max(1, start.s * ratio));
  const cx = (m0.x - start.x) / start.s;
  const cy = (m0.y - start.y) / start.s;
  return clampZoom({ s, x: m.x - s * cx, y: m.y - s * cy }, b);
}

export function panZoom(start: Zoom, dx: number, dy: number, b: ZoomBox): Zoom {
  return clampZoom({ s: start.s, x: start.x + dx, y: start.y + dy }, b);
}

/** After a pinch: snap back to fit when nearly 1×, and onto "fill" when close to it. */
export function snapZoom(z: Zoom, b: ZoomBox): Zoom {
  if (z.s < 1.08) return NO_ZOOM;
  const f = fillScale(b);
  if (f > 1.01 && Math.abs(z.s / f - 1) < 0.08) return clampZoom({ ...z, s: f }, b);
  return clampZoom(z, b);
}

/** The part of the (zoomed) picture that is visible on the stage, in stage px from the top-left. */
export function visiblePicture(z: Zoom, b: ZoomBox): { left: number; top: number; width: number; height: number } {
  const pw = b.picW * z.s;
  const ph = b.picH * z.s;
  const left = Math.max(0, b.w / 2 + z.x - pw / 2);
  const top = Math.max(0, b.h / 2 + z.y - ph / 2);
  const right = Math.min(b.w, b.w / 2 + z.x + pw / 2);
  const bottom = Math.min(b.h, b.h / 2 + z.y + ph / 2);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
