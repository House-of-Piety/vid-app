/**
 * Physical screen sizes of iPhones (active display rectangle), so the lens maths can work in millimetres.
 * Computed from the native pixel resolution and pixel density published by Apple:
 *   mm = px / ppi · 25.4
 * `cssW`/`cssH` are the portrait CSS-pixel sizes (screen.width / screen.height) used to auto-detect the model.
 */
export interface PhoneScreen {
  id: string;
  name: string;
  /** short side, mm */
  widthMm: number;
  /** long side, mm */
  heightMm: number;
  /** native pixels, portrait */
  widthPx: number;
  heightPx: number;
  cssW: number;
  cssH: number;
}

function phone(id: string, name: string, widthPx: number, heightPx: number, ppi: number, cssW: number, cssH: number): PhoneScreen {
  const mm = (px: number) => Math.round((px / ppi) * 25.4 * 100) / 100;
  return { id, name, widthMm: mm(widthPx), heightMm: mm(heightPx), widthPx, heightPx, cssW, cssH };
}

export const PHONES: PhoneScreen[] = [
  phone('iphone-7', 'iPhone 7 / 8 / SE (2nd & 3rd gen)', 750, 1334, 326, 375, 667),
  phone('iphone-7-plus', 'iPhone 7 Plus / 8 Plus', 1080, 1920, 401, 414, 736),
  phone('iphone-x', 'iPhone X / XS / 11 Pro', 1125, 2436, 458, 375, 812),
  phone('iphone-xs-max', 'iPhone XS Max / 11 Pro Max', 1242, 2688, 458, 414, 896),
  phone('iphone-xr', 'iPhone XR / 11', 828, 1792, 326, 414, 896),
  phone('iphone-12-mini', 'iPhone 12 mini / 13 mini', 1080, 2340, 476, 375, 812),
  phone('iphone-12', 'iPhone 12 / 12 Pro / 13 / 13 Pro / 14 / 16e', 1170, 2532, 460, 390, 844),
  phone('iphone-12-pro-max', 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus', 1284, 2778, 458, 428, 926),
  phone('iphone-14-pro', 'iPhone 14 Pro / 15 / 15 Pro / 16', 1179, 2556, 460, 393, 852),
  phone('iphone-14-pro-max', 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus', 1290, 2796, 460, 430, 932),
  phone('iphone-16-pro', 'iPhone 16 Pro / 17 / 17 Pro', 1206, 2622, 460, 402, 874),
  phone('iphone-16-pro-max', 'iPhone 16 Pro Max / 17 Pro Max', 1320, 2868, 460, 440, 956),
  phone('iphone-air', 'iPhone Air', 1260, 2736, 460, 420, 912),
];

export const PHONE_IPHONE_13_PRO = PHONES.find((p) => p.id === 'iphone-12')!;

/** Models whose CSS screen size matches this device (several models can share one). */
export function detectPhones(cssW: number, cssH: number): PhoneScreen[] {
  const w = Math.min(cssW, cssH);
  const h = Math.max(cssW, cssH);
  return PHONES.filter((p) => p.cssW === w && p.cssH === h);
}

/** Bank card (ISO/IEC 7810 ID-1) width, used for calibration. */
export const CARD_WIDTH_MM = 85.6;

/** Build a screen from a calibration: the card's width measured in CSS px. */
export function calibratedScreen(cardWidthCssPx: number, cssW: number, cssH: number): PhoneScreen {
  const mmPerCss = CARD_WIDTH_MM / cardWidthCssPx;
  const w = Math.min(cssW, cssH);
  const h = Math.max(cssW, cssH);
  return {
    id: 'calibrated',
    name: 'Calibrated with a bank card',
    widthMm: Math.round(w * mmPerCss * 100) / 100,
    heightMm: Math.round(h * mmPerCss * 100) / 100,
    widthPx: w,
    heightPx: h,
    cssW: w,
    cssH: h,
  };
}
