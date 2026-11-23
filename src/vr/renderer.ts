/**
 * WebGL2 stereo renderer for a Cardboard-style viewer.
 * Pass 1: each eye renders the scene into its own framebuffer with an off-axis projection matching the lens FOV.
 * Pass 2: each eye texture is drawn through a distortion mesh that pre-corrects the lens barrel distortion
 *         (mesh built with the profile's coefficients and an iterative inverse, see lens.ts).
 */
import { buildMesh, type Eye, type StereoLayout } from './lens';
import { frustumTan, multiply, quatConj, quatToMat4, scaling, translation, type Mat4, type Quat } from './math';

const VS_QUAD = `#version 300 es
in vec3 aPos; in vec2 aUv;
uniform mat4 uMvp;
out vec2 vUv;
void main() { vUv = aUv; gl_Position = uMvp * vec4(aPos, 1.0); }`;

const FS_TEX = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec4 uUvRect;
uniform vec4 uTint;
out vec4 o;
void main() { o = texture(uTex, uUvRect.xy + vUv * uUvRect.zw) * uTint; }`;

const VS_FLOOR = `#version 300 es
in vec3 aPos; in vec2 aUv;
uniform mat4 uMvp; uniform mat4 uModel;
out vec3 vWorld;
void main() { vWorld = (uModel * vec4(aPos, 1.0)).xyz; gl_Position = uMvp * vec4(aPos, 1.0); }`;

const FS_FLOOR = `#version 300 es
precision mediump float;
in vec3 vWorld;
out vec4 o;
void main() {
  vec2 g = abs(fract(vWorld.xz) - 0.5) / fwidth(vWorld.xz);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float fade = exp(-length(vWorld.xz) * 0.12);
  vec3 base = vec3(0.045, 0.045, 0.055);
  o = vec4(base + vec3(0.10, 0.07, 0.04) * line * fade, 1.0);
}`;

const VS_FULL = `#version 300 es
in vec2 aPos; in vec2 aUv;
out vec2 vUv;
void main() { vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Test pattern drawn in tan-angle space: straight lines should look straight through the lenses.
const FS_PATTERN = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uExtent; // texW, texH, xOff, yOff (tan units)
out vec4 o;
float lineAA(float d, float w) { return 1.0 - smoothstep(w, w + fwidth(d) * 1.5, d); }
void main() {
  vec2 p = vUv * uExtent.xy - uExtent.zw;
  vec3 c = vec3(0.06);
  vec2 grid = abs(fract(p / 0.1 + 0.5) - 0.5) * 0.1;
  float gw = fwidth(p.x) * 0.8;
  c = mix(c, vec3(0.75), lineAA(min(grid.x, grid.y), gw));
  c = mix(c, vec3(1.0, 0.54, 0.12), lineAA(min(abs(p.x), abs(p.y)), gw * 1.8));
  float r = length(p);
  for (int i = 1; i <= 5; i++) {
    c = mix(c, vec3(0.2, 0.8, 1.0), lineAA(abs(r - float(i) * 0.2), gw * 1.4));
  }
  // edge markers: if you can see all four coloured bands, the whole image is visible
  float e = 0.025;
  if (vUv.x < e) c = vec3(0.95, 0.2, 0.2);
  if (vUv.x > 1.0 - e) c = vec3(0.2, 0.9, 0.3);
  if (vUv.y < e) c = vec3(0.95, 0.85, 0.2);
  if (vUv.y > 1.0 - e) c = vec3(0.3, 0.5, 1.0);
  o = vec4(c, 1.0);
}`;

const FS_DISTORT = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 o;
void main() {
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  o = vec4(texture(uTex, vUv).rgb * smoothstep(0.0, 0.015, e), 1.0);
}`;

interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface EyeTarget {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  depth: WebGLRenderbuffer;
  w: number;
  h: number;
  mesh: { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] };
}

export interface SceneInputs {
  head: Quat;
  zoom: number;
  screen: { widthM: number; distanceM: number; aspect: number };
  sbs: boolean;
  testPattern: boolean;
  hud: { visible: boolean; center: [number, number, number]; widthM: number; heightM: number };
  cursor: { visible: boolean; distanceM: number; sizeM: number };
  showSource: boolean;
}

export class StereoRenderer {
  readonly gl: WebGL2RenderingContext;
  private texProg: Program;
  private floorProg: Program;
  private patternProg: Program;
  private distortProg: Program;
  private quad: WebGLVertexArrayObject;
  private fullQuad: WebGLVertexArrayObject;
  private eyes: Record<Eye, EyeTarget | null> = { left: null, right: null };
  private layout: StereoLayout | null = null;
  private sourceTex: WebGLTexture;
  private hudTex: WebGLTexture;
  private cursorTex: WebGLTexture;
  private whiteTex: WebGLTexture;
  private buffers: WebGLBuffer[] = [];
  private source: TexImageSource | null = null;
  private sourceReady = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    // ?vrdebug keeps the drawing buffer so screenshots / toDataURL work (slower; for testing only).
    const debug = typeof location !== 'undefined' && location.search.includes('vrdebug');
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance', preserveDrawingBuffer: debug });
    if (!gl) throw new Error('WebGL2 is not available on this device.');
    this.gl = gl;
    this.texProg = this.program(VS_QUAD, FS_TEX, ['uMvp', 'uTex', 'uUvRect', 'uTint']);
    this.floorProg = this.program(VS_FLOOR, FS_FLOOR, ['uMvp', 'uModel']);
    this.patternProg = this.program(VS_FULL, FS_PATTERN, ['uExtent']);
    this.distortProg = this.program(VS_FULL, FS_DISTORT, ['uTex']);
    this.quad = this.makeVao(
      new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]),
      3,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    );
    this.fullQuad = this.makeVao(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
    this.sourceTex = this.makeTexture();
    this.hudTex = this.makeTexture();
    this.cursorTex = this.makeTexture();
    this.whiteTex = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  }

  // ---------- setup helpers ----------
  private program(vs: string, fs: string, uniforms: string[]): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aUv');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    const u: Program['u'] = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(prog, name);
    return { prog, u };
  }

  private makeVao(pos: Float32Array, posSize: number, uv: Float32Array, indices?: Uint16Array): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, posSize, gl.FLOAT, false, 0, 0);
    const ub = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    this.buffers.push(pb, ub);
    if (indices) {
      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.buffers.push(ib);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }

  private upload(tex: WebGLTexture, src: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // Video elements are uploaded directly (no copy through a 2D canvas).
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  // ---------- public API ----------
  setSource(src: TexImageSource | null) {
    this.source = src;
    this.sourceReady = false;
  }

  /** Upload the current video frame / canvas. Call when a new frame is available. */
  updateSource(): boolean {
    const s = this.source;
    if (!s) return false;
    if (s instanceof HTMLVideoElement && (s.readyState < 2 || !s.videoWidth)) return false;
    try {
      this.upload(this.sourceTex, s);
      this.sourceReady = true;
      return true;
    } catch {
      return false;
    }
  }

  updateHud(c: TexImageSource) {
    this.upload(this.hudTex, c);
  }

  updateCursor(c: TexImageSource) {
    this.upload(this.cursorTex, c);
  }

  setLayout(layout: StereoLayout) {
    this.layout = layout;
    this.disposeEyes();
    const gl = this.gl;
    for (const eye of ['left', 'right'] as Eye[]) {
      const e = eye === 'left' ? layout.left : layout.right;
      // Eye buffer resolution: match the screen pixels its FOV covers (×1.2 for the lens magnification), capped.
      const pxPerTan = this.canvas.width / e.screenWidthTan;
      const w = Math.min(2048, Math.max(256, Math.round(e.textureWidthTan * pxPerTan * 1.2)));
      const h = Math.min(2048, Math.max(256, Math.round(e.textureHeightTan * pxPerTan * 1.2)));
      const tex = this.makeTexture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const depth = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const m = buildMesh(layout, eye, 40);
      const before = this.buffers.length;
      const vao = this.makeVao(m.positions, 2, m.uvs, m.indices);
      const buffers = this.buffers.splice(before);
      this.eyes[eye] = { fb, tex, depth, w, h, mesh: { vao, count: m.indices.length, buffers } };
    }
  }

  private disposeEyes() {
    const gl = this.gl;
    for (const eye of ['left', 'right'] as Eye[]) {
      const t = this.eyes[eye];
      if (!t) continue;
      gl.deleteFramebuffer(t.fb);
      gl.deleteTexture(t.tex);
      gl.deleteRenderbuffer(t.depth);
      gl.deleteVertexArray(t.mesh.vao);
      t.mesh.buffers.forEach((b) => gl.deleteBuffer(b));
      this.eyes[eye] = null;
    }
  }

  dispose() {
    this.disposeEyes();
    const gl = this.gl;
    this.buffers.forEach((b) => gl.deleteBuffer(b));
    [this.sourceTex, this.hudTex, this.cursorTex, this.whiteTex].forEach((t) => gl.deleteTexture(t));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // ---------- drawing ----------
  private drawTex(mvp: Mat4, tex: WebGLTexture, uvRect = [0, 0, 1, 1], tint = [1, 1, 1, 1]) {
    const gl = this.gl;
    const p = this.texProg;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uMvp, false, mvp);
    gl.uniform4fv(p.u.uUvRect, uvRect);
    gl.uniform4fv(p.u.uTint, tint);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u.uTex, 0);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderEye(eye: Eye, s: SceneInputs) {
    const gl = this.gl;
    const layout = this.layout!;
    const target = this.eyes[eye]!;
    const e = eye === 'left' ? layout.left : layout.right;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.SCISSOR_TEST);

    const z = s.testPattern ? 1 : s.zoom;
    const proj = frustumTan(e.fov.left / z, e.fov.right / z, e.fov.bottom / z, e.fov.top / z, 0.05, 200);
    const eyeX = (eye === 'left' ? -1 : 1) * (layout.interLensM / 2);
    const view = multiply(translation(-eyeX, 0, 0), quatToMat4(quatConj(s.head)));
    const vp = multiply(proj, view);

    if (s.testPattern) {
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.patternProg.prog);
      gl.uniform4f(this.patternProg.u.uExtent, e.textureWidthTan, e.textureHeightTan, e.xEyeOffsetTexture, e.yEyeOffsetTexture);
      gl.bindVertexArray(this.fullQuad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      gl.clearColor(0.03, 0.03, 0.038, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      // floor
      const floorModel = multiply(translation(0, -1.5, 0), multiply(quatToMat4([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]), scaling(60, 60, 1)));
      gl.useProgram(this.floorProg.prog);
      gl.uniformMatrix4fv(this.floorProg.u.uMvp, false, multiply(vp, floorModel));
      gl.uniformMatrix4fv(this.floorProg.u.uModel, false, floorModel);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // virtual screen
      const sw = s.screen.widthM;
      const sh = sw / s.screen.aspect;
      const screenModel = multiply(translation(0, 0, -s.screen.distanceM), scaling(sw, sh, 1));
      if (s.showSource && this.sourceReady) {
        const rect = s.sbs ? (eye === 'left' ? [0, 0, 0.5, 1] : [0.5, 0, 0.5, 1]) : [0, 0, 1, 1];
        this.drawTex(multiply(vp, screenModel), this.sourceTex, rect);
      } else {
        this.drawTex(multiply(vp, screenModel), this.whiteTex, undefined, [0.08, 0.08, 0.09, 1]);
      }
    }

    // HUD (world-locked) and gaze cursor (head-locked), drawn on top of the scene or the test pattern.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (s.hud.visible) {
      const [cx, cy, cz] = s.hud.center;
      this.drawTex(multiply(vp, multiply(translation(cx, cy, cz), scaling(s.hud.widthM, s.hud.heightM, 1))), this.hudTex);
    }
    if (s.cursor.visible) {
      const viewOnly = multiply(proj, translation(-eyeX, 0, 0));
      const m = multiply(translation(0, 0, -s.cursor.distanceM), scaling(s.cursor.sizeM, s.cursor.sizeM, 1));
      this.drawTex(multiply(viewOnly, m), this.cursorTex);
    }
    gl.disable(gl.BLEND);
  }

  render(s: SceneInputs) {
    if (!this.layout || !this.eyes.left || !this.eyes.right) return;
    const gl = this.gl;
    this.renderEye('left', s);
    this.renderEye('right', s);

    // Distortion pass onto the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    const half = Math.round(this.canvas.width / 2);
    for (const eye of ['left', 'right'] as Eye[]) {
      const t = this.eyes[eye]!;
      if (eye === 'left') gl.scissor(0, 0, half, this.canvas.height);
      else gl.scissor(half, 0, this.canvas.width - half, this.canvas.height);
      gl.useProgram(this.distortProg.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(this.distortProg.u.uTex, 0);
      gl.bindVertexArray(t.mesh.vao);
      gl.drawElements(gl.TRIANGLES, t.mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.SCISSOR_TEST);

    // Black separator between the eyes and the lens alignment marker (centre line from the bottom).
    const px = 2 / this.canvas.width;
    const sepW = 4 * (window.devicePixelRatio || 1) * px;
    this.drawTex(multiply(translation(0, 0, 0), scaling(sepW, 2, 1)), this.whiteTex, undefined, [0, 0, 0, 1]);
    const layout = this.layout;
    const markerH = Math.min(2, (layout.lensYFromBottomM / layout.screen.heightM) * 2 * 0.85);
    const markW = Math.max(2, 1.5 * (window.devicePixelRatio || 1)) * px;
    this.drawTex(multiply(translation(0, -1 + markerH / 2, 0), scaling(markW, markerH, 1)), this.whiteTex, undefined, [0.6, 0.6, 0.6, 1]);
  }
}
