/**
 * Bluetooth VR remote / gamepad input ("VR Box" style remotes, or any game controller) through the
 * Gamepad API. Polled once per frame; turns stick, d-pad and button presses into abstract actions.
 *
 * Mapping (works for the "standard" layout and for the raw layouts cheap remotes report):
 *   stick / d-pad left-right → 'left' / 'right' (repeats while held)
 *   stick / d-pad up-down    → 'up' / 'down'
 *   button 0 (A / trigger)    → 'select'
 *   button 1 (B)              → 'back'
 *   buttons 2, 3 (X, Y)       → 'playPause'
 *   buttons 4, 6 (LB, LT)     → 'prev'
 *   buttons 5, 7 (RB, RT)     → 'next'
 *   button 8 (select / back)  → 'recenter'
 *   button 9 (start / menu)   → 'menu'
 *
 * Remotes switched to their iOS / "music" mode act as a Bluetooth keyboard / media keys instead:
 * those arrive as key events (handled by the session) or as Media Session actions (handled by the host).
 */
export type PadAction = 'left' | 'right' | 'up' | 'down' | 'select' | 'back' | 'playPause' | 'prev' | 'next' | 'recenter' | 'menu';

/** The parts of a Gamepad we read (so tests can pass plain objects). */
export interface PadSnapshot {
  index: number;
  mapping?: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value?: number }[];
}

const STICK_ON = 0.6;
const STICK_OFF = 0.35;
const REPEAT_DELAY_MS = 450;
const REPEAT_MS = 180;

const BUTTON_ACTIONS: Record<number, PadAction> = {
  0: 'select',
  1: 'back',
  2: 'playPause',
  3: 'playPause',
  4: 'prev',
  5: 'next',
  6: 'prev',
  7: 'next',
  8: 'recenter',
  9: 'menu',
};

// standard-mapping d-pad buttons
const DPAD: Record<number, PadAction> = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

type Dir = 'left' | 'right' | 'up' | 'down';

interface PadState {
  buttons: boolean[];
  dir: Dir | null;
  dirSince: number;
  lastRepeat: number;
}

export class GamepadInput {
  private state = new Map<number, PadState>();
  /** Time of the last action from any pad (performance.now() clock). */
  lastActivity = -Infinity;

  /** Read the connected pads and return the actions since the last poll. */
  poll(now: number, pads?: readonly (PadSnapshot | null)[]): PadAction[] {
    const list = pads ?? readPads();
    const out: PadAction[] = [];
    for (const p of list) if (p) this.readOne(p, now, out);
    if (out.length) this.lastActivity = now;
    return out;
  }

  private readOne(p: PadSnapshot, now: number, out: PadAction[]) {
    let s = this.state.get(p.index);
    if (!s) {
      // First sight: remember what's already held so it doesn't fire.
      s = { buttons: p.buttons.map((b) => b.pressed), dir: null, dirSince: now, lastRepeat: now };
      s.dir = stickDir(p, null);
      this.state.set(p.index, s);
      return;
    }
    const standard = p.mapping === 'standard';
    p.buttons.forEach((b, i) => {
      const was = s!.buttons[i] ?? false;
      s!.buttons[i] = b.pressed;
      if (standard && DPAD[i]) return; // d-pad handled as a direction below
      if (b.pressed && !was && BUTTON_ACTIONS[i]) out.push(BUTTON_ACTIONS[i]);
    });

    let dir: Dir | null = null;
    if (standard) {
      for (const [i, d] of Object.entries(DPAD)) if (p.buttons[Number(i)]?.pressed) dir = d as Dir;
    }
    dir = dir ?? stickDir(p, s.dir);

    if (dir !== s.dir) {
      s.dir = dir;
      s.dirSince = now;
      s.lastRepeat = now;
      if (dir) out.push(dir);
    } else if (dir && (dir === 'left' || dir === 'right') && now - s.dirSince >= REPEAT_DELAY_MS && now - s.lastRepeat >= REPEAT_MS) {
      s.lastRepeat = now;
      out.push(dir);
    }
  }
}

/** Stick (axes 0/1, plus a hat-switch axis 9 some remotes report) → direction, with hysteresis. */
function stickDir(p: PadSnapshot, prev: Dir | null): Dir | null {
  const x = p.axes[0] ?? 0;
  const y = p.axes[1] ?? 0;
  const hat = hatDir(p.axes[9]);
  if (hat) return hat;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const on = Math.max(ax, ay) >= STICK_ON;
  if (!on) {
    // keep the previous direction until the stick is clearly released
    if (prev && Math.max(ax, ay) > STICK_OFF) return prev;
    return null;
  }
  if (ax >= ay) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

/** Hat switch encoded as one axis: −1 up, −0.71 up-right, … ; values > 1 = centred. */
function hatDir(v: number | undefined): Dir | null {
  // Valid positions are (i·2/7 − 1), i = 0..7; 0 and anything outside ±1 mean "centred / not a hat".
  if (v === undefined || v > 1.05 || v < -1.05 || Math.abs(v) < 0.05) return null;
  const steps = Math.round((v + 1) * 3.5); // 0..7, 0 = up, clockwise
  if (steps <= 0 || steps === 7) return 'up';
  if (steps <= 2) return 'right';
  if (steps <= 4) return 'down';
  return 'left';
}

function readPads(): readonly (PadSnapshot | null)[] {
  try {
    return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  } catch {
    return []; // e.g. blocked by a permissions policy
  }
}
