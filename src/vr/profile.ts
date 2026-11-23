/**
 * Cardboard viewer profiles ("DeviceParams" protobuf), as encoded in the viewer's QR code:
 *   https://google.com/cardboard/cfg?p=<base64url, no padding>
 */
import { packedFloats, readFields, Writer } from './protobuf';

export enum VerticalAlignment {
  Bottom = 0,
  Center = 1,
  Top = 2,
}

export enum PrimaryButton {
  None = 0,
  Magnet = 1,
  Touch = 2,
  IndirectTouch = 3,
}

export interface DeviceParams {
  vendor: string;
  model: string;
  /** metres */
  screenToLensDistance: number;
  /** metres */
  interLensDistance: number;
  /** degrees: left, right, bottom, top */
  leftEyeFieldOfViewAngles: [number, number, number, number];
  /** metres */
  trayToLensDistance: number;
  distortionCoefficients: number[];
  hasMagnet: boolean;
  verticalAlignment: VerticalAlignment;
  primaryButton: PrimaryButton;
}

// ---------- base64url ----------
export function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function base64UrlEncode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- protobuf ----------
const DEFAULTS: DeviceParams = {
  vendor: '',
  model: '',
  screenToLensDistance: 0.042,
  interLensDistance: 0.06,
  leftEyeFieldOfViewAngles: [40, 40, 40, 40],
  trayToLensDistance: 0.035,
  distortionCoefficients: [0.441, 0.156],
  hasMagnet: false,
  verticalAlignment: VerticalAlignment.Bottom,
  primaryButton: PrimaryButton.Magnet,
};

export function decodeDeviceParams(bytes: Uint8Array): DeviceParams {
  const fields = readFields(bytes);
  const p: DeviceParams = { ...DEFAULTS, leftEyeFieldOfViewAngles: [...DEFAULTS.leftEyeFieldOfViewAngles], distortionCoefficients: [...DEFAULTS.distortionCoefficients] };
  const dec = new TextDecoder();
  for (const f of fields) {
    switch (f.num) {
      case 1:
        if (f.bytes) p.vendor = dec.decode(f.bytes);
        break;
      case 2:
        if (f.bytes) p.model = dec.decode(f.bytes);
        break;
      case 3:
        if (f.f32 !== undefined) p.screenToLensDistance = f.f32;
        break;
      case 4:
        if (f.f32 !== undefined) p.interLensDistance = f.f32;
        break;
      case 6:
        if (f.f32 !== undefined) p.trayToLensDistance = f.f32;
        break;
      case 10:
        if (f.int !== undefined) p.hasMagnet = f.int !== 0;
        break;
      case 11:
        if (f.int !== undefined) p.verticalAlignment = f.int as VerticalAlignment;
        break;
      case 12:
        if (f.int !== undefined) p.primaryButton = f.int as PrimaryButton;
        break;
      default:
        break; // unknown fields are skipped
    }
  }
  const fov = packedFloats(fields, 5);
  if (fov.length >= 4) p.leftEyeFieldOfViewAngles = [fov[0], fov[1], fov[2], fov[3]];
  const k = packedFloats(fields, 7);
  if (fields.some((f) => f.num === 7)) p.distortionCoefficients = k;
  return p;
}

export function encodeDeviceParams(p: DeviceParams): Uint8Array {
  const w = new Writer();
  w.string(1, p.vendor);
  w.string(2, p.model);
  w.float(3, p.screenToLensDistance);
  w.float(4, p.interLensDistance);
  w.packedFloats(5, p.leftEyeFieldOfViewAngles);
  w.float(6, p.trayToLensDistance);
  w.packedFloats(7, p.distortionCoefficients);
  w.bool(10, p.hasMagnet);
  w.int(11, p.verticalAlignment);
  w.int(12, p.primaryButton);
  return w.finish();
}

export function toCfgUrl(p: DeviceParams): string {
  return `https://google.com/cardboard/cfg?p=${base64UrlEncode(encodeDeviceParams(p))}`;
}

// ---------- presets ----------
export const CARDBOARD_V2_URL =
  'https://google.com/cardboard/cfg?p=CgZHb29nbGUSEkNhcmRib2FyZCBJL08gMjAxNR0rGBU9JQHegj0qEAAASEIAAEhCAABIQgAASEJYADUpXA89OggeZnc-Ej6aPlAAYAM';

/** Original 2014 Cardboard (what g.co/cardboard pointed to). Values from the Cardboard SDK. */
export const CARDBOARD_V1: DeviceParams = {
  vendor: 'Google, Inc.',
  model: 'Cardboard v1',
  screenToLensDistance: 0.042,
  interLensDistance: 0.06,
  leftEyeFieldOfViewAngles: [40, 40, 40, 40],
  trayToLensDistance: 0.035,
  distortionCoefficients: [0.441, 0.156],
  hasMagnet: true,
  verticalAlignment: VerticalAlignment.Bottom,
  primaryButton: PrimaryButton.Magnet,
};

export const GENERIC_VIEWER: DeviceParams = {
  vendor: 'Generic',
  model: 'Generic viewer',
  screenToLensDistance: 0.039,
  interLensDistance: 0.063,
  leftEyeFieldOfViewAngles: [50, 50, 50, 50],
  trayToLensDistance: 0.035,
  distortionCoefficients: [0.25, 0.1],
  hasMagnet: false,
  verticalAlignment: VerticalAlignment.Bottom,
  primaryButton: PrimaryButton.Touch,
};

export interface Preset {
  id: string;
  name: string;
  params: DeviceParams;
}

export function builtinPresets(): Preset[] {
  return [
    { id: 'preset:v2', name: 'Cardboard v2 (2015)', params: parseViewerInput(CARDBOARD_V2_URL).params! },
    { id: 'preset:v1', name: 'Cardboard v1 (2014)', params: CARDBOARD_V1 },
    { id: 'preset:generic', name: 'Generic', params: GENERIC_VIEWER },
  ];
}

// ---------- URL / QR text parsing ----------
export type ParseResult =
  | { kind: 'ok'; params: DeviceParams; builtin?: string }
  | { kind: 'short-link'; url: string; message: string; params?: undefined }
  | { kind: 'error'; message: string; params?: undefined };

const SHORT_HOSTS = ['goo.gl', 'g.co', 'bit.ly', 'tinyurl.com', 'ow.ly', 't.co', 'qrco.de', 'is.gd'];

export const SHORT_LINK_HELP =
  'This is a short link, which can’t be read offline (and the browser isn’t allowed to follow its redirect). ' +
  'To get the full settings: open the link in Safari while online, wait until it lands on a page, copy the final address ' +
  '(it contains “google.com/cardboard/cfg?p=…”), and paste it here. Many old goo.gl links no longer work; if so, pick the ' +
  'closest built-in preset and adjust it in Fine-tune.';

export function isShortLink(text: string): boolean {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(text.trim()) ? text.trim() : `https://${text.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return SHORT_HOSTS.includes(host) && !u.searchParams.has('p');
  } catch {
    return false;
  }
}

/** Accepts any URL with a p= parameter (cfg, get/cardboard/download, http, www…), a bare base64url string, or a short link. */
export function parseViewerInput(text: string): ParseResult {
  const raw = text.trim();
  if (!raw) return { kind: 'error', message: 'Nothing to read.' };
  let url: URL | null = null;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    url = null;
  }
  const p = url?.searchParams.get('p') ?? (url && /[#&?]p=/.test(raw) ? new URLSearchParams(raw.split(/[?#]/)[1] ?? '').get('p') : null);
  if (p) {
    try {
      return { kind: 'ok', params: decodeDeviceParams(base64UrlDecode(p)) };
    } catch (e) {
      return { kind: 'error', message: `The viewer code is damaged (${e instanceof Error ? e.message : e}).` };
    }
  }
  if (url && url.hostname.includes('.')) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    if (host === 'g.co' && path === '/cardboard') return { kind: 'ok', params: CARDBOARD_V1, builtin: 'Cardboard v1 (2014)' };
    if (SHORT_HOSTS.includes(host)) return { kind: 'short-link', url: raw, message: SHORT_LINK_HELP };
    if (host.endsWith('google.com') && path.includes('cardboard'))
      return { kind: 'error', message: 'This Cardboard address has no viewer settings in it (no “p=” part).' };
  }
  // A bare base64url payload?
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) {
    try {
      const params = decodeDeviceParams(base64UrlDecode(raw));
      if (params.model || params.vendor) return { kind: 'ok', params };
    } catch {
      /* fall through */
    }
  }
  return { kind: 'error', message: 'That isn’t a Cardboard viewer code. It should look like google.com/cardboard/cfg?p=…' };
}
