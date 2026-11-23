/** Minimal protobuf wire-format reader/writer: varint (0), fixed64 (1, skipped), length-delimited (2), fixed32 (5). */

export interface Field {
  num: number;
  wire: number;
  /** varint value */
  int?: number;
  /** fixed32 raw bytes */
  f32?: number;
  /** length-delimited payload */
  bytes?: Uint8Array;
}

export function readFields(buf: Uint8Array): Field[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Field[] = [];
  let o = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (o >= buf.length) throw new Error('Truncated varint');
      const b = buf[o++];
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
      if (shift > 63) throw new Error('Varint too long');
    }
  };
  while (o < buf.length) {
    const tag = varint();
    const num = Math.floor(tag / 8);
    const wire = tag & 7;
    switch (wire) {
      case 0:
        out.push({ num, wire, int: varint() });
        break;
      case 1:
        if (o + 8 > buf.length) throw new Error('Truncated fixed64');
        o += 8; // unknown fixed64: skip
        break;
      case 2: {
        const len = varint();
        if (o + len > buf.length) throw new Error('Truncated field');
        out.push({ num, wire, bytes: buf.subarray(o, o + len) });
        o += len;
        break;
      }
      case 5:
        if (o + 4 > buf.length) throw new Error('Truncated fixed32');
        out.push({ num, wire, f32: view.getFloat32(o, true) });
        o += 4;
        break;
      default:
        throw new Error(`Unsupported wire type ${wire}`);
    }
  }
  return out;
}

/** Packed (or repeated non-packed) floats. */
export function packedFloats(fields: Field[], num: number): number[] {
  const out: number[] = [];
  for (const f of fields) {
    if (f.num !== num) continue;
    if (f.wire === 5 && f.f32 !== undefined) out.push(f.f32);
    else if (f.wire === 2 && f.bytes) {
      const v = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
      for (let i = 0; i + 4 <= f.bytes.length; i += 4) out.push(v.getFloat32(i, true));
    }
  }
  return out;
}

export class Writer {
  private parts: number[] = [];

  private varint(n: number) {
    let v = Math.floor(n);
    while (v >= 0x80) {
      this.parts.push((v % 128) | 0x80);
      v = Math.floor(v / 128);
    }
    this.parts.push(v);
  }

  private tag(num: number, wire: number) {
    this.varint(num * 8 + wire);
  }

  int(num: number, value: number) {
    this.tag(num, 0);
    this.varint(value);
  }

  bool(num: number, value: boolean) {
    this.int(num, value ? 1 : 0);
  }

  float(num: number, value: number) {
    this.tag(num, 5);
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, value, true);
    this.parts.push(...b);
  }

  bytes(num: number, data: Uint8Array) {
    this.tag(num, 2);
    this.varint(data.length);
    this.parts.push(...data);
  }

  string(num: number, s: string) {
    this.bytes(num, new TextEncoder().encode(s));
  }

  packedFloats(num: number, values: number[]) {
    const b = new Uint8Array(values.length * 4);
    const v = new DataView(b.buffer);
    values.forEach((x, i) => v.setFloat32(i * 4, x, true));
    this.bytes(num, b);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}
