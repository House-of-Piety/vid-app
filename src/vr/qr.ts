/** QR import/export for viewer profiles. All offline: jsQR (bundled) to read, qrcode-generator to draw. */
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';

/** Decode a QR code from raw RGBA pixels. Tries normal and inverted images. */
export function decodeQrImageData(data: Uint8ClampedArray, width: number, height: number): string | null {
  const r = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return r?.data ?? null;
}

function canvasFor(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Decode a QR from a photo or screenshot. Tries a few sizes because jsQR is sensitive to scale. */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file);
  } catch {
    // Older Safari: fall back to an <img>
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not read the image'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const w0 = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h0 = 'naturalHeight' in source ? source.naturalHeight : source.height;
  for (const maxSide of [1200, 800, 1800, 500]) {
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const c = canvasFor(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.drawImage(source, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const text = decodeQrImageData(img.data, w, h);
    if (text) return text;
  }
  return null;
}

/** Continuous camera scan (rear camera). Returns a stop function. */
export async function startCameraScan(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play().catch(() => undefined);
  let stopped = false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const tick = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const s = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * s);
      canvas.height = Math.round(video.videoHeight * s);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const r = jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
      if (r?.data) {
        onResult(r.data);
        return;
      }
    }
    setTimeout(() => requestAnimationFrame(tick), 120);
  };
  requestAnimationFrame(tick);
  return () => {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** QR modules for a text (for drawing / export). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** SVG markup for a QR code (white background, 4-module quiet zone). */
export function qrSvg(text: string, size = 256): string {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let path = '';
  m.forEach((row, r) => row.forEach((dark, c) => dark && (path += `M${c + 4} ${r + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
