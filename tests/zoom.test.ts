import { describe, expect, it } from 'vitest';
import { clampZoom, fillScale, NO_ZOOM, panZoom, pinchZoom, snapZoom, visiblePicture, zoomBox } from '../src/lib/zoom';

// iPhone 13 Pro portrait stage with a 16:9 video: picture 390 × 219.4
const portrait = zoomBox(390, 844, 16 / 9);
// landscape stage 844 × 390: picture 693.3 × 390
const landscape = zoomBox(844, 390, 16 / 9);

describe('video pinch zoom', () => {
  it('fit and fill scales', () => {
    expect(portrait.picW).toBe(390);
    expect(portrait.picH).toBeCloseTo(219.375, 3);
    expect(fillScale(landscape)).toBeCloseTo(844 / landscape.picW, 6);
    expect(fillScale(portrait)).toBeCloseTo(844 / 219.375, 6);
  });

  it('pinch keeps the point under the fingers fixed and stays in range', () => {
    const z = pinchZoom(NO_ZOOM, { x: 100, y: 0 }, { x: 100, y: 0 }, 2, landscape);
    expect(z.s).toBe(2);
    // picture point under x=100 at 1× is 100; at 2× it must still be at 100 → x = 100 - 2*100 = -100
    expect(z.x).toBeCloseTo(-100, 6);
    expect(pinchZoom(NO_ZOOM, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.3, landscape)).toEqual(NO_ZOOM);
    expect(pinchZoom(NO_ZOOM, { x: 0, y: 0 }, { x: 0, y: 0 }, 50, landscape).s).toBe(5);
  });

  it('panning cannot pull the picture edge into the stage', () => {
    const z = panZoom({ s: 2, x: 0, y: 0 }, 10000, -10000, landscape);
    expect(z.x).toBeCloseTo((2 * landscape.picW - 844) / 2, 6);
    expect(z.y).toBeCloseTo(-(2 * 390 - 390) / 2, 6);
    // picture narrower than the stage at this scale: stays centred
    expect(clampZoom({ s: 1.5, x: 50, y: 300 }, portrait).y).toBe(0);
  });

  it('snaps to fit near 1× and to fill near the fill scale', () => {
    expect(snapZoom({ s: 1.05, x: 3, y: 0 }, landscape)).toEqual(NO_ZOOM);
    const f = fillScale(landscape);
    expect(snapZoom({ s: f * 1.05, x: 0, y: 0 }, landscape).s).toBeCloseTo(f, 6);
    expect(snapZoom({ s: 3, x: 0, y: 0 }, landscape).s).toBe(3);
  });

  it('visible picture is clipped to the stage', () => {
    expect(visiblePicture(NO_ZOOM, portrait)).toEqual({ left: 0, top: (844 - portrait.picH) / 2, width: 390, height: portrait.picH });
    const v = visiblePicture({ s: 3, x: 0, y: 0 }, landscape);
    expect(v).toEqual({ left: 0, top: 0, width: 844, height: 390 });
  });
});
