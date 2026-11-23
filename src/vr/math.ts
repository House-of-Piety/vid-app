/** Minimal column-major mat4 and quaternion helpers for the VR renderer. */
export type Mat4 = Float32Array;
export type Quat = [number, number, number, number]; // x, y, z, w

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function scaling(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

/** Off-axis perspective from tan extents (left/right/bottom/top are positive tan values). */
export function frustumTan(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  const l = -left * near;
  const r = right * near;
  const b = -bottom * near;
  const t = top * near;
  const m = new Float32Array(16);
  m[0] = (2 * near) / (r - l);
  m[5] = (2 * near) / (t - b);
  m[8] = (r + l) / (r - l);
  m[9] = (t + b) / (t - b);
  m[10] = -(far + near) / (far - near);
  m[11] = -1;
  m[14] = (-2 * far * near) / (far - near);
  return m;
}

export function quatToMat4(q: Quat): Mat4 {
  const [x, y, z, w] = q;
  const m = identity();
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y + z * w);
  m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w);
  m[5] = 1 - 2 * (x * x + z * z);
  m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w);
  m[9] = 2 * (y * z - x * w);
  m[10] = 1 - 2 * (x * x + y * y);
  return m;
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

export function rotateVec(q: Quat, v: [number, number, number]): [number, number, number] {
  const p: Quat = [v[0], v[1], v[2], 0];
  const r = quatMul(quatMul(q, p), quatConj(q));
  return [r[0], r[1], r[2]];
}

/** Euler YXZ → quaternion (same convention as three.js). */
export function quatFromEulerYXZ(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

const DEG = Math.PI / 180;
const Q_CAMERA: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // −90° about X: camera looks out of the back of the phone

/** W3C deviceorientation (degrees) + screen orientation angle → camera orientation quaternion. */
export function deviceOrientationToQuat(alpha: number, beta: number, gamma: number, screenAngle: number): Quat {
  let q = quatFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  q = quatMul(q, Q_CAMERA);
  q = quatMul(q, quatAxisAngle(0, 0, 1, -screenAngle * DEG));
  return q;
}

/** Yaw-only part of an orientation (for recentring). */
export function yawOf(q: Quat): number {
  const f = rotateVec(q, [0, 0, -1]);
  return Math.atan2(-f[0], -f[2]);
}
