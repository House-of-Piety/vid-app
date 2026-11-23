import { useEffect, useRef, useState } from 'react';
import { requestMotionPermission, VRSession, WakeLock, type HudBindings } from '../session';
import { SCREEN_PRESETS, type FineTune, type ScreenPreset } from '../lens';
import { activeProfile, loadConfig, saveActiveId, savePhone, saveScene, saveTunes, tuneFor, type VRConfig } from '../store';
import { TUNE_PARAMS, stepTune } from '../tuneParams';
import type { HudContent } from '../hud';
import { PhonePicker } from './PhonePicker';
import './vr.css';

export interface PlaybackBindings {
  getState(): { playing: boolean; progress: number; chapterTitle: string };
  prev(): void;
  next(): void;
  togglePlay(): void;
}

interface Props {
  /** Video element or canvas to show on the virtual screen (null in test-pattern mode). */
  source: HTMLVideoElement | HTMLCanvasElement | null;
  /** Bump to re-upload a canvas source. */
  sourceVersion?: number;
  isVideo?: boolean;
  playback?: PlaybackBindings;
  /** Show the lens test pattern instead of the scene, with a fine-tune HUD. */
  testPattern?: boolean;
  onExit: () => void;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function VRView({ source, sourceVersion, isVideo, playback, testPattern, onExit }: Props) {
  const [cfg, setCfg] = useState<VRConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const session = useRef<VRSession | null>(null);
  const wake = useRef(new WakeLock());
  const cfgRef = useRef<VRConfig | null>(null);
  const tuneIdx = useRef(0);
  cfgRef.current = cfg;

  useEffect(() => {
    void loadConfig().then(setCfg);
  }, []);

  const exit = () => {
    session.current?.stop();
    session.current = null;
    wake.current.stop();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    try {
      (screen.orientation as unknown as { unlock?: () => void })?.unlock?.();
    } catch {
      /* ignore */
    }
    setRunning(false);
    onExit();
  };
  const exitRef = useRef(exit);
  exitRef.current = exit;

  useEffect(() => () => {
    session.current?.stop();
    wake.current.stop();
  }, []);

  useEffect(() => {
    session.current?.markSourceDirty();
  }, [sourceVersion]);

  const updateTune = (t: FineTune) => {
    const c = cfgRef.current!;
    const tunes = { ...c.tunes, [c.activeId]: t };
    setCfg({ ...c, tunes });
    void saveTunes(tunes);
    session.current?.update({ tune: t });
  };

  const hud = (): HudBindings => {
    if (testPattern) {
      return {
        getContent(): HudContent {
          const c = cfgRef.current!;
          const p = TUNE_PARAMS[tuneIdx.current];
          const t = tuneFor(c);
          return {
            title: `${p.label}: ${p.format(t[p.key])}`,
            buttons: [
              { id: 'minus', label: 'Less', icon: 'minus' },
              { id: 'cycle', label: 'Next setting', icon: 'cycle' },
              { id: 'plus', label: 'More', icon: 'plus' },
              { id: 'recenter', label: 'Recenter', icon: 'recenter' },
              { id: 'exit', label: 'Done', icon: 'exit' },
            ],
          };
        },
        onButton(id) {
          const c = cfgRef.current!;
          const p = TUNE_PARAMS[tuneIdx.current];
          if (id === 'cycle') tuneIdx.current = (tuneIdx.current + 1) % TUNE_PARAMS.length;
          else if (id === 'minus' || id === 'plus') updateTune(stepTune(tuneFor(c), p, id === 'plus' ? 1 : -1));
        },
      };
    }
    return {
      getContent(): HudContent {
        const st = playback?.getState() ?? { playing: false, progress: 0, chapterTitle: '' };
        return {
          title: st.chapterTitle,
          progress: st.progress,
          buttons: [
            { id: 'prev', label: 'Prev chapter', icon: 'prev' },
            { id: 'play', label: st.playing ? 'Pause' : 'Play', icon: st.playing ? 'pause' : 'play' },
            { id: 'next', label: 'Next chapter', icon: 'next' },
            { id: 'recenter', label: 'Recenter', icon: 'recenter' },
            { id: 'exit', label: 'Exit VR', icon: 'exit' },
          ],
        };
      },
      onButton(id) {
        if (id === 'prev') playback?.prev();
        else if (id === 'next') playback?.next();
        else if (id === 'play') playback?.togglePlay();
      },
      prev: () => playback?.prev(),
      next: () => playback?.next(),
      togglePlay: () => playback?.togglePlay(),
    };
  };

  async function start() {
    const c = cfgRef.current;
    if (!c?.phone) {
      setMessage('Choose your phone model first, so the lenses line up.');
      return;
    }
    let headTracking = c.scene.headTracking;
    if (headTracking) {
      // Must run inside this tap on iOS.
      const ok = await requestMotionPermission();
      if (!ok) {
        headTracking = false;
        setMessage('Motion access was not allowed, so the screen stays fixed. (Allow it in the next prompt, or check that the app is on HTTPS.)');
      }
    }
    if (!isIOS()) {
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => undefined);
    }
    const wl = await wake.current.start();
    if (!wl) console.info('Screen Wake Lock not available; the screen may dim.');
    setRunning(true);
    requestAnimationFrame(() => {
      if (!container.current) return;
      const p = activeProfile(c);
      try {
        session.current = new VRSession({
          container: container.current,
          source,
          params: p.params,
          phone: c.phone!,
          tune: tuneFor(c),
          headTracking,
          sbs: !!isVideo && c.scene.sbs,
          testPattern,
          hud: hud(),
          onExit: () => exitRef.current(),
        });
        session.current.start();
        container.current.querySelector('canvas')?.focus();
      } catch (e) {
        setRunning(false);
        setMessage(e instanceof Error ? e.message : String(e));
      }
    });
  }

  if (!cfg) return <div className="vr-root" />;

  const prof = activeProfile(cfg);
  const setScene = (patch: Partial<VRConfig['scene']>) => {
    const scene = { ...cfg.scene, ...patch };
    setCfg({ ...cfg, scene });
    void saveScene(scene);
  };
  const setPreset = (k: ScreenPreset) => {
    const t = { ...tuneFor(cfg), screenWidthM: SCREEN_PRESETS[k].widthM, screenDistanceM: SCREEN_PRESETS[k].distanceM };
    const tunes = { ...cfg.tunes, [cfg.activeId]: t };
    const scene = { ...cfg.scene, preset: k };
    setCfg({ ...cfg, tunes, scene });
    void saveTunes(tunes);
    void saveScene(scene);
  };

  return (
    <div className={`vr-root ${running ? 'running' : ''}`}>
      <div ref={container} className="vr-stage" />
      {!running && (
        <div className="vr-setup" role="dialog" aria-label="VR mode">
          <h2>{testPattern ? 'Lens test pattern' : 'VR mode'}</h2>
          <label className="vr-field">
            <span>Viewer</span>
            <select
              value={cfg.activeId}
              onChange={(e) => {
                setCfg({ ...cfg, activeId: e.target.value });
                void saveActiveId(e.target.value);
              }}
            >
              {cfg.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <PhonePicker
            value={cfg.phone}
            onChange={(p) => {
              setCfg({ ...cfg, phone: p });
              void savePhone(p);
              setMessage(null);
            }}
          />
          {!testPattern && (
            <>
              <div className="vr-field">
                <span>Screen</span>
                <div className="vr-seg" role="group" aria-label="Screen size preset">
                  {(Object.keys(SCREEN_PRESETS) as ScreenPreset[]).map((k) => (
                    <button key={k} className={cfg.scene.preset === k ? 'on' : ''} onClick={() => setPreset(k)}>
                      {SCREEN_PRESETS[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="vr-check">
                <input type="checkbox" checked={cfg.scene.headTracking} onChange={(e) => setScene({ headTracking: e.target.checked })} />
                Head tracking (screen stays put when you turn your head)
              </label>
              {isVideo && (
                <label className="vr-check">
                  <input type="checkbox" checked={cfg.scene.sbs} onChange={(e) => setScene({ sbs: e.target.checked })} />
                  Video is side-by-side 3D
                </label>
              )}
            </>
          )}
          {testPattern && (
            <p className="vr-muted">
              In the viewer: tap to show the controls, then use Less / More to adjust and “Next setting” to switch. Lines should look
              straight and all four coloured edges should be visible.
            </p>
          )}
          {message && <p className="vr-msg">{message}</p>}
          <p className="vr-muted small">
            {prof.params.vendor} {prof.params.model} · turn the phone to landscape and put it in the viewer after starting. Tap the
            screen for controls; look at a button for 1.5 s or tap while looking at it.
          </p>
          <div className="vr-row">
            <button className="btn primary" onClick={start}>
              Start
            </button>
            <button className="btn" onClick={exit}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
