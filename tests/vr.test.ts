import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  CARDBOARD_V1,
  CARDBOARD_V2_URL,
  PrimaryButton,
  VerticalAlignment,
  builtinPresets,
  decodeDeviceParams,
  encodeDeviceParams,
  isShortLink,
  parseViewerInput,
  toCfgUrl,
  type DeviceParams,
} from '../src/vr/profile';
import { RadialDistortion } from '../src/vr/distortion';
import { buildMesh, computeLayout, DEFAULT_TUNE, fitScreenWidth, lensCenterPx } from '../src/vr/lens';
import { PHONE_IPHONE_13_PRO, PHONES, detectPhones } from '../src/vr/screens';
import { decodeQrImageData } from '../src/vr/qr';
import { GamepadInput, type PadSnapshot } from '../src/vr/gamepad';

const VIEWMASTER_URL =
  'https://www.google.com/get/cardboard/download/?p=CgxNYXR0ZWwsIEluYy4SGFZJRVctTUFTVEVS4oSiIFZSIFZJRVdFUh0xCCw9JWiRbT0qEAAASEIAAEhCAABIQgAASEJYATUpXA89OggpXA8-SOE6P1AAYAM';

function ok(text: string): DeviceParams {
  const r = parseViewerInput(text);
  if (r.kind !== 'ok') throw new Error(`${r.kind}: ${r.message}`);
  return r.params;
}

describe('viewer profile decoding', () => {
  it('Cardboard v2 test vector: every field', () => {
    const p = ok(CARDBOARD_V2_URL);
    expect(p.vendor).toBe('Google');
    expect(p.model).toBe('Cardboard I/O 2015');
    expect(p.screenToLensDistance).toBeCloseTo(0.0364, 4);
    expect(p.interLensDistance).toBeCloseTo(0.0639, 4);
    expect(p.leftEyeFieldOfViewAngles).toEqual([50, 50, 50, 50]);
    expect(p.trayToLensDistance).toBeCloseTo(0.035, 4);
    expect(p.distortionCoefficients).toHaveLength(2);
    expect(p.distortionCoefficients[0]).toBeCloseTo(0.2416, 4);
    expect(p.distortionCoefficients[1]).toBeCloseTo(0.3013, 4);
    expect(p.hasMagnet).toBe(false);
    expect(p.verticalAlignment).toBe(VerticalAlignment.Bottom);
    expect(p.primaryButton).toBe(PrimaryButton.IndirectTouch);
  });

  it('Mattel View-Master test vector: every field', () => {
    const p = ok(VIEWMASTER_URL);
    expect(p.vendor).toBe('Mattel, Inc.');
    expect(p.model).toBe('VIEW-MASTER™ VR VIEWER');
    expect(p.screenToLensDistance).toBeCloseTo(0.042, 4);
    expect(p.interLensDistance).toBeCloseTo(0.058, 4);
    expect(p.leftEyeFieldOfViewAngles).toEqual([50, 50, 50, 50]);
    expect(p.trayToLensDistance).toBeCloseTo(0.035, 4);
    expect(p.distortionCoefficients[0]).toBeCloseTo(0.14, 4);
    expect(p.distortionCoefficients[1]).toBeCloseTo(0.73, 4);
    expect(p.hasMagnet).toBe(false); // field 10 = 0 in this vector
    expect(p.verticalAlignment).toBe(VerticalAlignment.Center);
    expect(p.primaryButton).toBe(PrimaryButton.IndirectTouch);
  });

  it('accepts http://, www., bare host and get/cardboard/download URLs', () => {
    const p = CARDBOARD_V2_URL.split('?p=')[1];
    for (const u of [
      `http://google.com/cardboard/cfg?p=${p}`,
      `https://www.google.com/cardboard/cfg?p=${p}`,
      `google.com/cardboard/cfg?p=${p}`,
      `https://www.google.com/get/cardboard/download/?p=${p}`,
      `https://example.org/anything?x=1&p=${p}`,
    ]) {
      expect(ok(u).model).toBe('Cardboard I/O 2015');
    }
  });

  it('export → import round trip', () => {
    for (const preset of builtinPresets()) {
      const back = ok(toCfgUrl(preset.params));
      expect(back.vendor).toBe(preset.params.vendor);
      expect(back.model).toBe(preset.params.model);
      expect(back.screenToLensDistance).toBeCloseTo(preset.params.screenToLensDistance, 6);
      expect(back.interLensDistance).toBeCloseTo(preset.params.interLensDistance, 6);
      expect(back.trayToLensDistance).toBeCloseTo(preset.params.trayToLensDistance, 6);
      back.leftEyeFieldOfViewAngles.forEach((v, i) => expect(v).toBeCloseTo(preset.params.leftEyeFieldOfViewAngles[i], 5));
      back.distortionCoefficients.forEach((v, i) => expect(v).toBeCloseTo(preset.params.distortionCoefficients[i], 6));
      expect(back.verticalAlignment).toBe(preset.params.verticalAlignment);
      expect(back.primaryButton).toBe(preset.params.primaryButton);
      expect(back.hasMagnet).toBe(preset.params.hasMagnet);
    }
  });

  it('re-encoding the v2 vector decodes to the same values', () => {
    const p = ok(CARDBOARD_V2_URL);
    expect(decodeDeviceParams(encodeDeviceParams(p))).toEqual(p);
  });

  it('skips unknown fields', () => {
    const base = encodeDeviceParams(CARDBOARD_V1);
    // field 99 varint, field 98 fixed32, field 97 length-delimited, field 96 fixed64
    const extra = Uint8Array.from([0x98, 0x06, 0x05, 0x95, 0x06, 1, 2, 3, 4, 0x8a, 0x06, 2, 0x41, 0x42, 0x81, 0x06, 1, 2, 3, 4, 5, 6, 7, 8]);
    const p = decodeDeviceParams(Uint8Array.from([...extra, ...base]));
    expect(p.model).toBe('Cardboard v1');
  });
});

describe('short links', () => {
  it('detects goo.gl / g.co links', () => {
    expect(isShortLink('https://goo.gl/abc123')).toBe(true);
    expect(isShortLink('goo.gl/abc123')).toBe(true);
    expect(isShortLink('http://g.co/cardboard')).toBe(true);
    expect(isShortLink(CARDBOARD_V2_URL)).toBe(false);
  });
  it('g.co/cardboard uses the built-in v1 profile', () => {
    const r = parseViewerInput('http://g.co/cardboard');
    expect(r.kind).toBe('ok');
    expect(r.params?.model).toBe('Cardboard v1');
  });
  it('other short links explain what to do', () => {
    const r = parseViewerInput('https://goo.gl/qZtZ6o');
    expect(r.kind).toBe('short-link');
    if (r.kind === 'short-link') expect(r.message).toMatch(/Safari/);
  });
  it('rejects junk', () => {
    expect(parseViewerInput('hello world').kind).toBe('error');
  });
});

describe('distortion', () => {
  const vectors = [ok(CARDBOARD_V2_URL), ok(VIEWMASTER_URL), CARDBOARD_V1];
  it('forward/inverse round trip error < 0.001 across the lens radius', () => {
    for (const p of vectors) {
      const d = new RadialDistortion(p.distortionCoefficients);
      const maxR = Math.tan((Math.max(...p.leftEyeFieldOfViewAngles) * Math.PI) / 180) * 1.2;
      for (let i = 0; i <= 200; i++) {
        const r = (maxR * i) / 200;
        expect(Math.abs(d.distortInverse(d.distort(r)) - r)).toBeLessThan(0.001);
        expect(Math.abs(d.distort(d.distortInverse(r)) - r)).toBeLessThan(0.001);
      }
    }
  });
  it('matches the polynomial', () => {
    const d = new RadialDistortion([0.2416, 0.3013]);
    expect(d.distort(0.5)).toBeCloseTo(0.5 * (1 + 0.2416 * 0.25 + 0.3013 * 0.0625), 10);
  });
});

describe('lens layout on an iPhone 13 Pro', () => {
  const phone = PHONE_IPHONE_13_PRO;
  const screen = { widthM: phone.heightMm / 1000, heightM: phone.widthMm / 1000 };
  const canvasW = phone.heightPx; // landscape
  const canvasH = phone.widthPx;

  it('has the right physical size', () => {
    expect(phone.heightMm).toBeCloseTo(139.81, 1);
    expect(phone.widthMm).toBeCloseTo(64.6, 1);
    expect(detectPhones(390, 844).map((p) => p.id)).toContain('iphone-12');
  });

  it('places the v2 lens centres by inter-lens distance and tray distance (bottom alignment)', () => {
    const layout = computeLayout(ok(CARDBOARD_V2_URL), screen, DEFAULT_TUNE);
    const L = lensCenterPx(layout, 'left', canvasW, canvasH);
    const R = lensCenterPx(layout, 'right', canvasW, canvasH);
    const pxPerMm = canvasW / phone.heightMm;
    // centred horizontally, 63.9 mm apart
    expect((L.x + R.x) / 2).toBeCloseTo(canvasW / 2, 3);
    expect((R.x - L.x) / pxPerMm).toBeCloseTo(63.9, 1);
    // 35 mm tray-to-lens minus the 3 mm border = 32 mm above the bottom edge
    expect((canvasH - L.y) / pxPerMm).toBeCloseTo(32, 1);
    expect(L.y).toBeCloseTo(R.y, 6);
  });

  it('centre alignment (View-Master) puts lenses at mid-height', () => {
    const layout = computeLayout(ok(VIEWMASTER_URL), screen, DEFAULT_TUNE);
    expect(lensCenterPx(layout, 'left', canvasW, canvasH).y).toBeCloseTo(canvasH / 2, 3);
  });

  it('fine-tune offsets move the lens centres', () => {
    const p = ok(CARDBOARD_V2_URL);
    const a = computeLayout(p, screen, DEFAULT_TUNE);
    const b = computeLayout(p, screen, { ...DEFAULT_TUNE, ipdOffsetMm: 2, verticalOffsetMm: 1 });
    const pxPerMm = canvasW / phone.heightMm;
    const dx = lensCenterPx(b, 'right', canvasW, canvasH).x - lensCenterPx(a, 'right', canvasW, canvasH).x;
    const dy = lensCenterPx(a, 'left', canvasW, canvasH).y - lensCenterPx(b, 'left', canvasW, canvasH).y;
    expect(dx / pxPerMm).toBeCloseTo(1, 3);
    expect(dy / pxPerMm).toBeCloseTo(1, 3);
  });

  it('eye FOV is clipped by the screen edges and the lens', () => {
    const layout = computeLayout(ok(CARDBOARD_V2_URL), screen, DEFAULT_TUNE);
    const t50 = Math.tan((50 * Math.PI) / 180);
    const f = layout.left.fov;
    for (const v of [f.left, f.right, f.bottom, f.top]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(t50 + 1e-9);
    }
    // the right eye mirrors the left eye
    expect(layout.right.fov.left).toBeCloseTo(f.right, 9);
    expect(layout.right.fov.right).toBeCloseTo(f.left, 9);
  });

  it('distortion mesh stays on its own half of the screen and is centred on the lens', () => {
    const layout = computeLayout(ok(CARDBOARD_V2_URL), screen, DEFAULT_TUNE);
    const n = 41;
    const left = buildMesh(layout, 'left', n);
    const right = buildMesh(layout, 'right', n);
    for (let i = 0; i < left.positions.length; i += 2) {
      expect(left.positions[i]).toBeLessThanOrEqual(1e-4);
      expect(right.positions[i]).toBeGreaterThanOrEqual(-1e-4);
    }
    // The texture point at the optical axis maps to the lens centre on screen.
    const e = layout.left;
    const uAxis = e.xEyeOffsetTexture / e.textureWidthTan;
    const vAxis = e.yEyeOffsetTexture / e.textureHeightTan;
    expect(uAxis).toBeGreaterThan(0);
    expect(vAxis).toBeGreaterThan(0);
    const L = lensCenterPx(layout, 'left', canvasW, canvasH);
    const xNdcLens = (L.x / canvasW) * 2 - 1;
    // nearest vertex in uv to the axis
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < left.uvs.length; i += 2) {
      const dd = Math.hypot(left.uvs[i] - uAxis, left.uvs[i + 1] - vAxis);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    expect(Math.abs(left.positions[best] - xNdcLens)).toBeLessThan(0.03);
  });

  it('shrink-to-fit keeps the default screen inside the view', () => {
    const layout = computeLayout(ok(CARDBOARD_V2_URL), screen, DEFAULT_TUNE);
    const w = fitScreenWidth(layout, DEFAULT_TUNE.screenDistanceM, 16 / 9, 1);
    const halfTan = w / 2 / DEFAULT_TUNE.screenDistanceM;
    expect(halfTan).toBeLessThan(Math.min(layout.left.fov.left, layout.left.fov.right));
  });

  it('every phone in the table has sane dimensions', () => {
    for (const p of PHONES) {
      expect(p.heightMm).toBeGreaterThan(p.widthMm);
      expect(p.widthMm).toBeGreaterThan(55);
      expect(p.heightMm).toBeLessThan(165);
    }
  });
});

describe('QR image import', () => {
  for (const [name, url] of [
    ['qr-cardboard-v2.png', CARDBOARD_V2_URL],
    ['qr-viewmaster.png', VIEWMASTER_URL],
  ] as const) {
    it(`decodes ${name}`, () => {
      const png = PNG.sync.read(readFileSync(join(__dirname, 'fixtures', name)));
      const text = decodeQrImageData(new Uint8ClampedArray(png.data), png.width, png.height);
      expect(text).toBe(url);
      expect(parseViewerInput(text!).kind).toBe('ok');
    });
  }
});

describe('VR remote / gamepad mapping', () => {
  const pad = (over: Partial<PadSnapshot> = {}, pressed: number[] = []): PadSnapshot => ({
    index: 0,
    mapping: '',
    axes: [0, 0],
    buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: pressed.includes(i) })),
    ...over,
  });

  it('ignores what is already held when the pad first appears, then fires on press edges', () => {
    const g = new GamepadInput();
    expect(g.poll(0, [pad({}, [0])])).toEqual([]);
    expect(g.poll(16, [pad({}, [0])])).toEqual([]);
    expect(g.poll(32, [pad()])).toEqual([]);
    expect(g.poll(48, [pad({}, [0])])).toEqual(['select']);
    expect(g.poll(64, [pad({}, [1, 2, 5, 9])])).toEqual(['back', 'playPause', 'next', 'menu']);
  });

  it('stick directions fire once, with hysteresis, and left/right repeat while held', () => {
    const g = new GamepadInput();
    g.poll(0, [pad()]);
    expect(g.poll(10, [pad({ axes: [0.9, 0.1] })])).toEqual(['right']);
    expect(g.poll(100, [pad({ axes: [0.5, 0] })])).toEqual([]); // still above release threshold
    expect(g.poll(500, [pad({ axes: [0.9, 0] })])).toEqual(['right']); // repeat after 450 ms
    expect(g.poll(550, [pad({ axes: [0.9, 0] })])).toEqual([]);
    expect(g.poll(600, [pad({ axes: [0.1, 0] })])).toEqual([]);
    expect(g.poll(610, [pad({ axes: [0, -0.8] })])).toEqual(['up']);
    expect(g.poll(2000, [pad({ axes: [0, -0.8] })])).toEqual([]); // up/down don't repeat
  });

  it('standard mapping: d-pad buttons are directions, not button actions', () => {
    const g = new GamepadInput();
    g.poll(0, [pad({ mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false })) })]);
    const b = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 14 }));
    expect(g.poll(10, [pad({ mapping: 'standard', buttons: b })])).toEqual(['left']);
  });

  it('reads a hat-switch axis and treats out-of-range as centred', () => {
    const g = new GamepadInput();
    const axes = (h: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, h];
    g.poll(0, [pad({ axes: axes(3.2857) })]);
    expect(g.poll(10, [pad({ axes: axes(-1) })])).toEqual(['up']);
    expect(g.poll(20, [pad({ axes: axes(3.2857) })])).toEqual([]);
    expect(g.poll(30, [pad({ axes: axes(5 / 7) })])).toEqual(['left']);
    expect(g.poll(40, [pad({ axes: axes(-3 / 7) })])).toEqual(['right']);
  });
});
