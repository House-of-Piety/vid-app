/**
 * Stereo layout for a Cardboard-style viewer, following the Cardboard SDK (lens_distortion.cc / distortion_mesh.cc).
 * All "tan" values are tangents of view angles; the screen is in landscape with the tray at the bottom.
 */
import { RadialDistortion } from './distortion';
import { VerticalAlignment, type DeviceParams } from './profile';

/** Border between the tray and the bottom of the phone's active screen area (Cardboard SDK constant). */
export const BORDER_SIZE_M = 0.003;

export interface FineTune {
  /** Added to the profile's inter-lens distance, mm (±5). */
  ipdOffsetMm: number;
  /** Moves the lens centres up (+) or down (−), mm (±5). */
  verticalOffsetMm: number;
  /** Multiplies k1, k2… (0 – 1.5). */
  distortionScale: number;
  /** Zoom of the rendered scene (0.6 – 1.4). >1 = things look bigger. */
  zoom: number;
  /** Virtual screen width, metres. */
  screenWidthM: number;
  /** Virtual screen distance, metres. */
  screenDistanceM: number;
  /** Keep the whole virtual screen inside the visible area (recommended with glasses). */
  shrinkToFit: boolean;
}

export type ScreenPreset = 'cinema' | 'comfortable' | 'small';

export const SCREEN_PRESETS: Record<ScreenPreset, { label: string; widthM: number; distanceM: number }> = {
  cinema: { label: 'Cinema', widthM: 9, distanceM: 4.5 },
  comfortable: { label: 'Comfortable', widthM: 3.2, distanceM: 2.6 },
  small: { label: 'Small', widthM: 2, distanceM: 2.8 },
};

export const DEFAULT_TUNE: FineTune = {
  ipdOffsetMm: 0,
  verticalOffsetMm: 0,
  distortionScale: 1,
  zoom: 1,
  screenWidthM: SCREEN_PRESETS.comfortable.widthM,
  screenDistanceM: SCREEN_PRESETS.comfortable.distanceM,
  shrinkToFit: true,
};

export interface PhysicalScreen {
  /** landscape width (long side), metres */
  widthM: number;
  /** landscape height (short side), metres */
  heightM: number;
}

export type Eye = 'left' | 'right';

export interface EyeLayout {
  eye: Eye;
  /** tan of the visible half-angles: left, right, bottom, top */
  fov: { left: number; right: number; bottom: number; top: number };
  screenWidthTan: number;
  screenHeightTan: number;
  /** lens centre measured from the left / bottom edge of the whole screen, tan units */
  xEyeOffsetScreen: number;
  yEyeOffsetScreen: number;
  textureWidthTan: number;
  textureHeightTan: number;
  xEyeOffsetTexture: number;
  yEyeOffsetTexture: number;
}

export interface StereoLayout {
  left: EyeLayout;
  right: EyeLayout;
  distortion: RadialDistortion;
  interLensM: number;
  /** lens centre height above the bottom of the screen, metres */
  lensYFromBottomM: number;
  screen: PhysicalScreen;
}

/** Lens-centre height above the bottom edge of the active screen (Cardboard SDK GetYEyeOffsetMeters). */
export function lensYFromBottom(params: DeviceParams, screen: PhysicalScreen, verticalOffsetMm = 0): number {
  let y: number;
  switch (params.verticalAlignment) {
    case VerticalAlignment.Center:
      y = screen.heightM / 2;
      break;
    case VerticalAlignment.Top:
      y = screen.heightM - (params.trayToLensDistance - BORDER_SIZE_M);
      break;
    case VerticalAlignment.Bottom:
    default:
      y = params.trayToLensDistance - BORDER_SIZE_M;
  }
  return y + verticalOffsetMm / 1000;
}

export function computeLayout(params: DeviceParams, screen: PhysicalScreen, tune: Pick<FineTune, 'ipdOffsetMm' | 'verticalOffsetMm' | 'distortionScale'>): StereoLayout {
  const d = params.screenToLensDistance;
  const interLens = params.interLensDistance + tune.ipdOffsetMm / 1000;
  const distortion = new RadialDistortion(params.distortionCoefficients).scaled(tune.distortionScale);
  const yOff = lensYFromBottom(params, screen, tune.verticalOffsetMm);
  const deg = Math.PI / 180;
  const [fl, fr, fb, ft] = params.leftEyeFieldOfViewAngles.map((a) => Math.tan(a * deg));

  // Visible extents: limited by the lens FOV and by the screen edges (seen through the lens).
  const outer = distortion.distort((screen.widthM - interLens) / 2 / d);
  const inner = distortion.distort(interLens / 2 / d);
  const bottom = distortion.distort(yOff / d);
  const top = distortion.distort((screen.heightM - yOff) / d);
  const leftFov = { left: Math.min(outer, fl), right: Math.min(inner, fr), bottom: Math.min(bottom, fb), top: Math.min(top, ft) };
  const rightFov = { left: leftFov.right, right: leftFov.left, bottom: leftFov.bottom, top: leftFov.top };

  const make = (eye: Eye, fov: EyeLayout['fov']): EyeLayout => ({
    eye,
    fov,
    screenWidthTan: screen.widthM / d,
    screenHeightTan: screen.heightM / d,
    xEyeOffsetScreen: (eye === 'left' ? screen.widthM / 2 - interLens / 2 : screen.widthM / 2 + interLens / 2) / d,
    yEyeOffsetScreen: yOff / d,
    textureWidthTan: fov.left + fov.right,
    textureHeightTan: fov.bottom + fov.top,
    xEyeOffsetTexture: fov.left,
    yEyeOffsetTexture: fov.bottom,
  });
  return { left: make('left', leftFov), right: make('right', rightFov), distortion, interLensM: interLens, lensYFromBottomM: yOff, screen };
}

/** Lens centre in canvas pixels (origin top-left) for a canvas covering the whole physical screen. */
export function lensCenterPx(layout: StereoLayout, eye: Eye, canvasW: number, canvasH: number): { x: number; y: number } {
  const e = eye === 'left' ? layout.left : layout.right;
  return {
    x: (e.xEyeOffsetScreen / e.screenWidthTan) * canvasW,
    y: (1 - e.yEyeOffsetScreen / e.screenHeightTan) * canvasH,
  };
}

/** Distortion mesh for one eye: vertex positions in NDC (whole canvas) and texture coordinates. */
export function buildMesh(layout: StereoLayout, eye: Eye, resolution = 40) {
  const e = eye === 'left' ? layout.left : layout.right;
  const n = resolution;
  const positions = new Float32Array(n * n * 2);
  const uvs = new Float32Array(n * n * 2);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const uT = col / (n - 1);
      const vT = row / (n - 1);
      const xT = uT * e.textureWidthTan - e.xEyeOffsetTexture;
      const yT = vT * e.textureHeightTan - e.yEyeOffsetTexture;
      const [xS, yS] = layout.distortion.distortInversePoint(xT, yT);
      const uS = (xS + e.xEyeOffsetScreen) / e.screenWidthTan;
      const vS = (yS + e.yEyeOffsetScreen) / e.screenHeightTan;
      const i = 2 * (row * n + col);
      positions[i] = 2 * uS - 1;
      positions[i + 1] = 2 * vS - 1;
      uvs[i] = uT;
      uvs[i + 1] = vT;
    }
  }
  // Triangle-strip-free index list (two triangles per cell).
  const indices = new Uint16Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }
  return { positions, uvs, indices };
}

/** Largest virtual-screen width that fits inside both eyes' visible area at the given distance. */
export function fitScreenWidth(layout: StereoLayout, distanceM: number, aspect: number, zoom: number, margin = 0.9): number {
  const h = Math.min(layout.left.fov.left, layout.left.fov.right, layout.right.fov.left, layout.right.fov.right);
  const v = Math.min(layout.left.fov.bottom, layout.left.fov.top);
  // Zoom >1 magnifies, so the visible tan range in scene units shrinks by 1/zoom.
  const maxByH = 2 * distanceM * (h / zoom) * margin;
  const maxByV = 2 * distanceM * (v / zoom) * margin * aspect;
  return Math.min(maxByH, maxByV);
}
