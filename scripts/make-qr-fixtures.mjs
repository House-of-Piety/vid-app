// Writes QR-code PNGs of the two viewer test URLs to tests/fixtures/ (for the image-import test).
// Run: npm run fixtures:qr
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import qrcode from 'qrcode-generator';

const urls = {
  'qr-cardboard-v2.png':
    'https://google.com/cardboard/cfg?p=CgZHb29nbGUSEkNhcmRib2FyZCBJL08gMjAxNR0rGBU9JQHegj0qEAAASEIAAEhCAABIQgAASEJYADUpXA89OggeZnc-Ej6aPlAAYAM',
  'qr-viewmaster.png':
    'https://www.google.com/get/cardboard/download/?p=CgxNYXR0ZWwsIEluYy4SGFZJRVctTUFTVEVS4oSiIFZSIFZJRVdFUh0xCCw9JWiRbT0qEAAASEIAAEhCAABIQgAASEJYATUpXA89OggpXA8-SOE6P1AAYAM',
};

const SCALE = 6;
const QUIET = 4;
for (const [name, text] of Object.entries(urls)) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = (n + QUIET * 2) * SCALE;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.floor(y / SCALE) - QUIET;
      const c = Math.floor(x / SCALE) - QUIET;
      const dark = r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
      const i = (y * size + x) * 4;
      // a light grey "photo-ish" background instead of pure white
      const v = dark ? 20 : 235;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(join(process.cwd(), 'tests', 'fixtures', name), PNG.sync.write(png));
  console.log('wrote', name, `${size}x${size}`);
}
