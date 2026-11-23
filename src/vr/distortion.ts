/**
 * Polynomial radial lens distortion, the model used by the Cardboard SDK:
 *   r' = r · (1 + k1·r² + k2·r⁴ + …)
 * r is in tan-angle units (distance on screen / screen-to-lens distance).
 * `distort` maps a point on the screen to where the eye sees it through the lens;
 * `distortInverse` maps a viewing direction back to the screen point that must be drawn.
 */
export class RadialDistortion {
  constructor(readonly k: number[]) {}

  /** Factor f(r²) such that r' = r · f. */
  factor(r2: number): number {
    let result = 1;
    let rPow = r2;
    for (const k of this.k) {
      result += k * rPow;
      rPow *= r2;
    }
    return result;
  }

  distort(r: number): number {
    return r * this.factor(r * r);
  }

  /** d(distort)/dr */
  private derivative(r: number): number {
    // d/dr [r + Σ k_i r^(2i+1)] = 1 + Σ (2i+1) k_i r^(2i)
    let result = 1;
    const r2 = r * r;
    let rPow = r2;
    this.k.forEach((k, i) => {
      result += (2 * (i + 1) + 1) * k * rPow;
      rPow *= r2;
    });
    return result;
  }

  /** Newton iteration (falls back to secant-like damping if the derivative is tiny). */
  distortInverse(rDistorted: number): number {
    if (Math.abs(rDistorted) < 1e-9) return rDistorted;
    let r = rDistorted / Math.max(0.5, this.factor(rDistorted * rDistorted));
    for (let i = 0; i < 30; i++) {
      const err = this.distort(r) - rDistorted;
      if (Math.abs(err) < 1e-9) break;
      const d = this.derivative(r);
      const step = err / (Math.abs(d) < 1e-6 ? 1e-6 : d);
      r -= Math.max(-0.5, Math.min(0.5, step));
    }
    return r;
  }

  /** Apply inverse to a 2D point (direction preserved). */
  distortInversePoint(x: number, y: number): [number, number] {
    const r = Math.hypot(x, y);
    if (r < 1e-9) return [x, y];
    const s = this.distortInverse(r) / r;
    return [x * s, y * s];
  }

  distortPoint(x: number, y: number): [number, number] {
    const f = this.factor(x * x + y * y);
    return [x * f, y * f];
  }

  scaled(strength: number): RadialDistortion {
    return new RadialDistortion(this.k.map((k) => k * strength));
  }
}
