/**
 * A running VR view: owns the canvas, renderer, head tracking, HUD and input. Framework-free.
 */
import { StereoRenderer, type SceneInputs } from './renderer';
import { computeLayout, fitScreenWidth, type FineTune, type StereoLayout } from './lens';
import type { DeviceParams } from './profile';
import type { PhoneScreen } from './screens';
import { deviceOrientationToQuat, quatAxisAngle, quatConj, quatFromEulerYXZ, quatMul, rotateVec, yawOf, type Quat } from './math';
import { HUD_H, HUD_W, drawCursor, drawHud, hudButtonAt, type HudContent } from './hud';

/**
 * What the HUD shows and does. Button ids 'recenter' and 'exit' are handled by the session itself;
 * every other id is passed to onButton. Optional key shortcuts for desktop preview: prev/next/togglePlay.
 */
export interface HudBindings {
  getContent(): HudContent;
  onButton(id: string): void;
  prev?(): void;
  next?(): void;
  togglePlay?(): void;
}

export interface VRSessionOptions {
  container: HTMLElement;
  /** Video element (used directly as a texture) or a canvas (e.g. audio cover). null = no source. */
  source: HTMLVideoElement | HTMLCanvasElement | null;
  params: DeviceParams;
  phone: PhoneScreen;
  tune: FineTune;
  headTracking: boolean;
  sbs: boolean;
  testPattern?: boolean;
  hud?: HudBindings;
  onExit(): void;
}

const DWELL_MS = 1500;
const LONG_PRESS_MS = 600;
const HUD_AUTOHIDE_MS = 10000;

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Must be called from a user tap (iOS requirement). Returns true if motion events may be used. */
export async function requestMotionPermission(): Promise<boolean> {
  const DOE = (globalThis as unknown as { DeviceOrientationEvent?: MotionPermission }).DeviceOrientationEvent;
  if (!DOE) return false;
  if (typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/** Screen Wake Lock with automatic re-acquire when the page becomes visible again. */
export class WakeLock {
  private lock: { release(): Promise<void> } | null = null;
  private active = false;
  private onVis = () => {
    if (this.active && document.visibilityState === 'visible') void this.acquire();
  };
  async start(): Promise<boolean> {
    this.active = true;
    document.addEventListener('visibilitychange', this.onVis);
    return this.acquire();
  }
  private async acquire(): Promise<boolean> {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (!wl) return false;
      this.lock = await wl.request('screen');
      return true;
    } catch {
      return false;
    }
  }
  stop() {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVis);
    void this.lock?.release().catch(() => undefined);
    this.lock = null;
  }
}

function screenAngle(): number {
  const a = screen.orientation?.angle;
  if (typeof a === 'number') return a;
  const w = (window as unknown as { orientation?: number }).orientation;
  return typeof w === 'number' ? w : 0;
}

export class VRSession {
  private canvas: HTMLCanvasElement;
  private rotateMsg: HTMLDivElement;
  private renderer: StereoRenderer;
  private layout!: StereoLayout;
  private opts: VRSessionOptions;
  private raf = 0;
  private running = false;
  private sourceDirty = true;
  private videoFrameHandle = 0;
  private hudCanvas = document.createElement('canvas');
  private cursorCanvas = document.createElement('canvas');
  private hudVisible = false;
  private hudHighlight = 1;
  private hudLastInteraction = 0;
  private hudDirty = true;
  private lastHudDraw = 0;
  private lastHudKey = '';
  private dwell: { index: number; start: number; fired: boolean } = { index: -1, start: 0, fired: false };
  private gazeIndex = -1;
  // orientation
  private deviceQuat: Quat | null = null;
  private base: Quat = [0, 0, 0, 1];
  private mouseYaw = 0;
  private mousePitch = 0;
  private pointerDown: { t: number; x: number; y: number; id: number; type: string; moved: boolean } | null = null;
  private resizeObs: ResizeObserver;
  private physical = false;
  private lastCss = { w: 0, h: 0 };

  constructor(opts: VRSessionOptions) {
    this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vr-canvas';
    this.canvas.setAttribute('aria-label', 'VR view. Tap to show controls.');
    this.canvas.tabIndex = 0;
    this.rotateMsg = document.createElement('div');
    this.rotateMsg.className = 'vr-rotate';
    this.rotateMsg.innerHTML = '<div class="vr-rotate-icon"></div><p>Turn your phone to landscape</p>';
    opts.container.append(this.canvas, this.rotateMsg);
    this.hudCanvas.width = HUD_W;
    this.hudCanvas.height = HUD_H;
    this.cursorCanvas.width = this.cursorCanvas.height = 64;
    this.renderer = new StereoRenderer(this.canvas);
    this.renderer.setSource(opts.source);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(opts.container);
    this.bindInput();
    this.resize();
  }

  // ---------- configuration ----------
  update(patch: Partial<Pick<VRSessionOptions, 'params' | 'phone' | 'tune' | 'headTracking' | 'sbs' | 'testPattern' | 'source'>>) {
    const needLayout = patch.params || patch.phone || patch.tune;
    Object.assign(this.opts, patch);
    if (patch.source !== undefined) {
      this.renderer.setSource(patch.source);
      this.sourceDirty = true;
      this.watchVideoFrames();
    }
    if (needLayout) this.resize(true);
  }

  markSourceDirty() {
    this.sourceDirty = true;
  }

  recenter() {
    if (this.deviceQuat) this.base = quatAxisAngle(0, 1, 0, yawOf(this.deviceQuat));
    this.mouseYaw = 0;
    this.mousePitch = 0;
  }

  /** Is the canvas mapped 1:1 onto the physical phone screen (vs. a desktop preview)? */
  get isPhysical() {
    return this.physical;
  }

  private resize(force = false) {
    const c = this.opts.container;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const landscape = cw >= ch;
    this.rotateMsg.style.display = landscape ? 'none' : 'flex';
    this.canvas.style.visibility = landscape ? 'visible' : 'hidden';
    if (!landscape) return;
    if (!force && cw === this.lastCss.w && ch === this.lastCss.h) return;
    this.lastCss = { w: cw, h: ch };
    const phone = this.opts.phone;
    const sw = Math.max(screen.width, screen.height);
    const sh = Math.min(screen.width, screen.height);
    // On the phone itself, the CSS screen size matches the model: map CSS px to mm directly.
    this.physical = sw === phone.cssH && sh === phone.cssW;
    let wCss: number;
    let hCss: number;
    let widthM: number;
    let heightM: number;
    if (this.physical) {
      const mmPerCss = phone.heightMm / phone.cssH;
      wCss = cw;
      hCss = ch;
      widthM = (cw * mmPerCss) / 1000;
      heightM = (ch * mmPerCss) / 1000;
    } else {
      // Desktop / other device: preview at the chosen phone's aspect ratio.
      const aspect = phone.heightMm / phone.widthMm;
      wCss = Math.min(cw, ch * aspect);
      hCss = wCss / aspect;
      widthM = phone.heightMm / 1000;
      heightM = phone.widthMm / 1000;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.style.width = `${wCss}px`;
    this.canvas.style.height = `${hCss}px`;
    this.canvas.width = Math.round(wCss * dpr);
    this.canvas.height = Math.round(hCss * dpr);
    this.layout = computeLayout(this.opts.params, { widthM, heightM }, this.opts.tune);
    this.renderer.setLayout(this.layout);
  }

  // ---------- lifecycle ----------
  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener('deviceorientation', this.onOrientation);
    this.watchVideoFrames();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('deviceorientation', this.onOrientation);
    const v = this.opts.source;
    if (v instanceof HTMLVideoElement && this.videoFrameHandle && 'cancelVideoFrameCallback' in v) v.cancelVideoFrameCallback(this.videoFrameHandle);
    this.resizeObs.disconnect();
    this.unbindInput();
    this.renderer.dispose();
    this.canvas.remove();
    this.rotateMsg.remove();
  }

  private watchVideoFrames() {
    const v = this.opts.source;
    if (!(v instanceof HTMLVideoElement) || !('requestVideoFrameCallback' in v)) return;
    const cb = () => {
      this.sourceDirty = true;
      if (this.running) this.videoFrameHandle = v.requestVideoFrameCallback(cb);
    };
    this.videoFrameHandle = v.requestVideoFrameCallback(cb);
  }

  private onOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const first = !this.deviceQuat;
    this.deviceQuat = deviceOrientationToQuat(e.alpha, e.beta, e.gamma, screenAngle());
    if (first) this.recenter();
  };

  private headPose(): Quat {
    if (!this.opts.headTracking) return [0, 0, 0, 1];
    if (this.deviceQuat) return quatMul(quatConj(this.base), this.deviceQuat);
    // Desktop preview: mouse-drag look.
    return quatFromEulerYXZ(this.mousePitch, this.mouseYaw, 0);
  }

  // ---------- HUD geometry ----------
  private hudGeometry() {
    const l = this.layout;
    const z = this.opts.testPattern ? 1 : this.opts.tune.zoom;
    const hTan = Math.min(l.left.fov.left, l.left.fov.right) / z;
    const vTan = Math.min(l.left.fov.bottom, l.left.fov.top) / z;
    const dist = Math.min(this.opts.tune.screenDistanceM * 0.7, 1.6);
    const widthM = 2 * dist * hTan * 0.85;
    const heightM = (widthM * HUD_H) / HUD_W;
    const bottomLimit = -dist * vTan * 0.95;
    const cy = Math.max(-dist * vTan * 0.4, bottomLimit + heightM / 2);
    return { dist, widthM, heightM, center: [0, cy, -dist] as [number, number, number] };
  }

  private gazeHit(head: Quat, hud: ReturnType<VRSession['hudGeometry']>): number {
    const dir = rotateVec(head, [0, 0, -1]);
    if (dir[2] > -0.05) return -1;
    const t = -hud.dist / dir[2];
    const px = dir[0] * t;
    const py = dir[1] * t;
    const u = (px - (hud.center[0] - hud.widthM / 2)) / hud.widthM;
    const v = (hud.center[1] + hud.heightM / 2 - py) / hud.heightM;
    if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
    return hudButtonAt(u * HUD_W, v * HUD_H, this.hudContent().buttons.length);
  }

  private hudContent(): HudContent {
    return this.opts.hud?.getContent() ?? { title: '', buttons: [{ id: 'recenter', label: 'Recenter', icon: 'recenter' }, { id: 'exit', label: 'Exit VR', icon: 'exit' }] };
  }

  private activate(i: number) {
    const b = this.hudContent().buttons[i];
    if (!b) return;
    this.hudLastInteraction = performance.now();
    this.hudDirty = true;
    if (b.id === 'recenter') this.recenter();
    else if (b.id === 'exit') this.opts.onExit();
    else this.opts.hud?.onButton(b.id);
  }

  private showHud(v: boolean) {
    this.hudVisible = v;
    this.hudDirty = true;
    this.hudLastInteraction = performance.now();
    this.dwell = { index: -1, start: 0, fired: false };
  }

  // ---------- frame ----------
  private frame() {
    if (this.canvas.style.visibility === 'hidden') return;
    const now = performance.now();
    const v = this.opts.source;
    if (v instanceof HTMLVideoElement && !('requestVideoFrameCallback' in (v as object)) && !v.paused) this.sourceDirty = true;
    if (this.sourceDirty && this.renderer.updateSource()) this.sourceDirty = false;

    const head = this.headPose();
    const hud = this.hudGeometry();
    const tracking = this.opts.headTracking && (!!this.deviceQuat || !this.isTouchDevice());

    if (this.hudVisible && !tracking && now - this.hudLastInteraction > HUD_AUTOHIDE_MS) this.showHud(false);

    // gaze + dwell
    let dwellProgress = 0;
    this.gazeIndex = this.hudVisible && tracking ? this.gazeHit(head, hud) : -1;
    if (this.gazeIndex >= 0) {
      if (this.dwell.index !== this.gazeIndex) this.dwell = { index: this.gazeIndex, start: now, fired: false };
      dwellProgress = Math.min(1, (now - this.dwell.start) / DWELL_MS);
      if (dwellProgress >= 1 && !this.dwell.fired) {
        this.dwell.fired = true;
        this.activate(this.gazeIndex);
      }
      if (this.dwell.fired) dwellProgress = 0;
      this.hudHighlight = this.gazeIndex;
    } else if (this.dwell.index !== -1) {
      this.dwell = { index: -1, start: 0, fired: false };
    }

    if (this.hudVisible) {
      const st = this.hudContent();
      if (this.hudHighlight >= st.buttons.length) this.hudHighlight = 0;
      const key = `${st.title}|${st.buttons.map((b) => b.label + b.icon).join(',')}|${Math.round((st.progress ?? 0) * 400)}|${this.hudHighlight}|${Math.round(dwellProgress * 20)}`;
      if (this.hudDirty || (key !== this.lastHudKey && now - this.lastHudDraw > 90)) {
        drawHud(this.hudCanvas, { ...st, highlight: this.hudHighlight, dwell: dwellProgress });
        this.renderer.updateHud(this.hudCanvas);
        drawCursor(this.cursorCanvas, dwellProgress, this.gazeIndex >= 0);
        this.renderer.updateCursor(this.cursorCanvas);
        this.lastHudKey = key;
        this.lastHudDraw = now;
        this.hudDirty = false;
      }
    }

    const fitW = fitScreenWidth(this.layout, this.opts.tune.screenDistanceM, this.sourceAspect(), this.opts.tune.zoom);
    const screenW = this.opts.tune.shrinkToFit ? Math.min(this.opts.tune.screenWidthM, fitW) : this.opts.tune.screenWidthM;
    const inputs: SceneInputs = {
      head,
      zoom: this.opts.tune.zoom,
      screen: { widthM: screenW, distanceM: this.opts.tune.screenDistanceM, aspect: this.sourceAspect() },
      sbs: this.opts.sbs,
      testPattern: !!this.opts.testPattern,
      hud: { visible: this.hudVisible, center: hud.center, widthM: hud.widthM, heightM: hud.heightM },
      cursor: { visible: this.hudVisible && tracking, distanceM: hud.dist * 0.98, sizeM: hud.dist * 0.05 },
      showSource: !!this.opts.source,
    };
    this.renderer.render(inputs);
  }

  private sourceAspect(): number {
    const s = this.opts.source;
    if (s instanceof HTMLVideoElement && s.videoWidth && s.videoHeight) return s.videoWidth / s.videoHeight;
    if (s instanceof HTMLCanvasElement && s.height) return s.width / s.height;
    return 16 / 9;
  }

  private isTouchDevice() {
    return navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
  }

  // ---------- input ----------
  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointerDown = { t: performance.now(), x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, moved: false };
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointerDown;
    if (!p || p.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
    // desktop preview: drag to look around
    if (p.moved && this.opts.headTracking && !this.deviceQuat && e.pointerType === 'mouse') {
      this.mouseYaw -= e.movementX * 0.005;
      this.mousePitch = Math.max(-1.2, Math.min(1.2, this.mousePitch - e.movementY * 0.005));
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointerDown;
    this.pointerDown = null;
    if (!p || p.id !== e.pointerId || (p.moved && p.type === 'mouse')) return;
    const dur = performance.now() - p.t;
    const tracking = this.opts.headTracking && (!!this.deviceQuat || !this.isTouchDevice());
    if (!this.hudVisible) {
      this.showHud(true);
      return;
    }
    this.hudLastInteraction = performance.now();
    if (tracking) {
      // Tap while looking at a button = select; tap elsewhere hides the HUD.
      if (this.gazeIndex >= 0) this.activate(this.gazeIndex);
      else this.showHud(false);
    } else if (dur >= LONG_PRESS_MS) {
      this.activate(this.hudHighlight);
    } else {
      this.hudHighlight = (this.hudHighlight + 1) % this.hudContent().buttons.length;
      this.hudDirty = true;
    }
  };

  private onKey = (e: KeyboardEvent) => {
    let handled = true;
    switch (e.key) {
      case 'Escape':
        this.opts.onExit();
        break;
      case 'h':
      case 'H':
        this.showHud(!this.hudVisible);
        break;
      case 'ArrowRight':
        if (this.hudVisible) this.hudHighlight = (this.hudHighlight + 1) % this.hudContent().buttons.length;
        else this.opts.hud?.next?.();
        this.hudDirty = true;
        break;
      case 'ArrowLeft':
        if (this.hudVisible) this.hudHighlight = (this.hudHighlight + this.hudContent().buttons.length - 1) % this.hudContent().buttons.length;
        else this.opts.hud?.prev?.();
        this.hudDirty = true;
        break;
      case 'Enter':
        if (this.hudVisible) this.activate(this.hudHighlight);
        else this.showHud(true);
        break;
      case ' ':
        this.opts.hud?.togglePlay?.();
        this.hudDirty = true;
        break;
      case 'r':
      case 'R':
        this.recenter();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  private noCtx = (e: Event) => e.preventDefault();

  private bindInput() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', this.noCtx);
    window.addEventListener('keydown', this.onKey);
  }

  private unbindInput() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.noCtx);
    window.removeEventListener('keydown', this.onKey);
  }
}
