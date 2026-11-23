import { useEffect, useMemo, useRef, useState } from 'react';
import { PrimaryButton, VerticalAlignment, parseViewerInput, toCfgUrl, type DeviceParams } from '../profile';
import { decodeQrFromFile, qrSvg, startCameraScan } from '../qr';
import { DEFAULT_TUNE, SCREEN_PRESETS, type ScreenPreset } from '../lens';
import {
  activeProfile,
  loadConfig,
  saveActiveId,
  savePhone,
  saveScene,
  saveTunes,
  saveUserProfiles,
  tuneFor,
  type SavedProfile,
  type VRConfig,
} from '../store';
import { TUNE_PARAMS } from '../tuneParams';
import { PhonePicker } from './PhonePicker';
import { VRView } from './VRView';
import './vr.css';

const ALIGN = ['Bottom', 'Centre', 'Top'];
const BUTTON = ['None', 'Magnet', 'Touch', 'Indirect touch'];

function ParamsTable({ p }: { p: DeviceParams }) {
  const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;
  return (
    <table className="vr-table">
      <tbody>
        <tr><th>Vendor / model</th><td>{p.vendor} · {p.model}</td></tr>
        <tr><th>Screen to lens</th><td>{mm(p.screenToLensDistance)}</td></tr>
        <tr><th>Inter-lens distance</th><td>{mm(p.interLensDistance)}</td></tr>
        <tr><th>Tray to lens</th><td>{mm(p.trayToLensDistance)}</td></tr>
        <tr><th>Field of view (L, R, B, T)</th><td>{p.leftEyeFieldOfViewAngles.map((a) => `${a.toFixed(0)}°`).join(', ')}</td></tr>
        <tr><th>Distortion k</th><td>{p.distortionCoefficients.map((k) => k.toFixed(4)).join(', ') || 'none'}</td></tr>
        <tr><th>Vertical alignment</th><td>{ALIGN[p.verticalAlignment as VerticalAlignment] ?? p.verticalAlignment}</td></tr>
        <tr><th>Button</th><td>{BUTTON[p.primaryButton as PrimaryButton] ?? p.primaryButton}</td></tr>
      </tbody>
    </table>
  );
}

/** Viewer profiles, phone size, fine-tune, test pattern. */
export function VRSettings() {
  const [cfg, setCfg] = useState<VRConfig | null>(null);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'warn' } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [testPattern, setTestPattern] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  const stopScan = useRef<(() => void) | null>(null);

  useEffect(() => {
    void loadConfig().then(setCfg);
    return () => stopScan.current?.();
  }, []);

  const prof = cfg ? activeProfile(cfg) : null;
  const tune = cfg ? tuneFor(cfg) : DEFAULT_TUNE;
  const cfgUrl = useMemo(() => (prof ? toCfgUrl(prof.params) : ''), [prof]);

  if (!cfg || !prof) return null;

  const addProfile = (params: DeviceParams, note?: string) => {
    const name = `${params.vendor} ${params.model}`.trim() || 'Imported viewer';
    const id = `user:${Date.now().toString(36)}`;
    const p: SavedProfile = { id, name, params };
    const profiles = [p, ...cfg.profiles];
    setCfg({ ...cfg, profiles, activeId: id });
    void saveUserProfiles(profiles);
    void saveActiveId(id);
    setMsg({ text: `Imported “${name}”${note ? ` (${note})` : ''} and made it active.`, kind: 'ok' });
  };

  const importText = (text: string) => {
    const r = parseViewerInput(text);
    if (r.kind === 'ok') addProfile(r.params, r.builtin ? `built-in ${r.builtin} settings for g.co/cardboard` : undefined);
    else setMsg({ text: r.message, kind: 'warn' });
  };

  const startScan = async () => {
    setMsg(null);
    setScanning(true);
    await new Promise((r) => requestAnimationFrame(r));
    try {
      stopScan.current = await startCameraScan(camVideo.current!, (text) => {
        stopScan.current?.();
        stopScan.current = null;
        setScanning(false);
        importText(text);
      });
    } catch (e) {
      setScanning(false);
      setMsg({ text: `Camera not available (${e instanceof Error ? e.message : e}). Try “From photo” instead.`, kind: 'warn' });
    }
  };

  const setTune = (patch: Partial<typeof tune>) => {
    const t = { ...tune, ...patch };
    const tunes = { ...cfg.tunes, [cfg.activeId]: t };
    setCfg({ ...cfg, tunes });
    void saveTunes(tunes);
  };

  const setPreset = (k: ScreenPreset) => {
    setTune({ screenWidthM: SCREEN_PRESETS[k].widthM, screenDistanceM: SCREEN_PRESETS[k].distanceM });
    const scene = { ...cfg.scene, preset: k };
    setCfg((c) => (c ? { ...c, scene } : c));
    void saveScene(scene);
  };

  if (testPattern) {
    return (
      <VRView
        source={null}
        testPattern
        onExit={() => {
          setTestPattern(false);
          void loadConfig().then(setCfg);
        }}
      />
    );
  }

  return (
    <div className="vr-settings">
      <section>
        <h2>Viewer</h2>
        <ul className="vr-profiles">
          {cfg.profiles.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="radio"
                  name="vr-profile"
                  checked={p.id === cfg.activeId}
                  onChange={() => {
                    setCfg({ ...cfg, activeId: p.id });
                    void saveActiveId(p.id);
                  }}
                />
                <span>{p.name}</span>
                {p.builtin && <small className="vr-muted"> built-in</small>}
              </label>
              {!p.builtin && (
                <span className="vr-row-actions">
                  <button
                    className="vr-link"
                    onClick={() => {
                      const name = prompt('Name for this viewer', p.name)?.trim();
                      if (!name) return;
                      const profiles = cfg.profiles.map((x) => (x.id === p.id ? { ...x, name } : x));
                      setCfg({ ...cfg, profiles });
                      void saveUserProfiles(profiles);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="vr-link danger"
                    onClick={() => {
                      if (!confirm(`Delete “${p.name}”?`)) return;
                      const profiles = cfg.profiles.filter((x) => x.id !== p.id);
                      const activeId = cfg.activeId === p.id ? profiles[0].id : cfg.activeId;
                      setCfg({ ...cfg, profiles, activeId });
                      void saveUserProfiles(profiles);
                      void saveActiveId(activeId);
                    }}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        <h3>Import your viewer's QR code</h3>
        <p className="vr-muted">Gives the same lens settings the Google Cardboard app uses. Works offline.</p>
        <div className="vr-row">
          <button className="btn primary" onClick={startScan} disabled={scanning}>
            Scan with camera
          </button>
          <button className="btn" onClick={() => photo.current?.click()}>
            From photo
          </button>
          <input
            ref={photo}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const text = await decodeQrFromFile(f).catch(() => null);
              if (text) importText(text);
              else setMsg({ text: 'No QR code found in that picture. Try a closer, sharper photo with the whole code visible.', kind: 'warn' });
            }}
          />
        </div>
        {scanning && (
          <div className="vr-scan">
            <video ref={camVideo} playsInline muted />
            <div className="vr-scan-frame" aria-hidden="true" />
            <button
              className="btn"
              onClick={() => {
                stopScan.current?.();
                stopScan.current = null;
                setScanning(false);
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <form
          className="vr-paste"
          onSubmit={(e) => {
            e.preventDefault();
            importText(paste);
          }}
        >
          <label className="vr-field">
            <span>Or paste the address</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://google.com/cardboard/cfg?p=…"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <button className="btn" type="submit" disabled={!paste.trim()}>
            Import
          </button>
        </form>
        {msg && <p className={`vr-msg ${msg.kind}`}>{msg.text}</p>}

        <h3>Active viewer: {prof.name}</h3>
        <ParamsTable p={prof.params} />
        <div className="vr-row">
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(cfgUrl);
                setMsg({ text: 'Viewer address copied. Paste it on the other device.', kind: 'ok' });
              } catch {
                setShowExport(true);
              }
            }}
          >
            Copy address
          </button>
          <button className="btn" onClick={() => setShowExport((s) => !s)}>
            {showExport ? 'Hide QR' : 'Show as QR'}
          </button>
        </div>
        {showExport && (
          <div className="vr-export">
            <div className="vr-qr" dangerouslySetInnerHTML={{ __html: qrSvg(cfgUrl, 240) }} />
            <code>{cfgUrl}</code>
          </div>
        )}
      </section>

      <section>
        <h2>Phone screen</h2>
        <PhonePicker
          value={cfg.phone}
          onChange={(p) => {
            setCfg({ ...cfg, phone: p });
            void savePhone(p);
          }}
        />
      </section>

      <section>
        <h2>Fine-tune for “{prof.name}”</h2>
        <p className="vr-muted">
          Saved per viewer. Glasses add distance between eye and lens: if you wear them, keep “Shrink to fit” on and reduce the screen size
          until both edges are visible.
        </p>
        {TUNE_PARAMS.map((p) => (
          <label key={p.key} className="vr-slider">
            <span>
              {p.label} <b>{p.format(tune[p.key])}</b>
            </span>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={tune[p.key]}
              onChange={(e) => setTune({ [p.key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <div className="vr-field">
          <span>Screen preset</span>
          <div className="vr-seg" role="group" aria-label="Screen size preset">
            {(Object.keys(SCREEN_PRESETS) as ScreenPreset[]).map((k) => (
              <button key={k} className={cfg.scene.preset === k ? 'on' : ''} onClick={() => setPreset(k)}>
                {SCREEN_PRESETS[k].label}
              </button>
            ))}
          </div>
        </div>
        <label className="vr-check">
          <input type="checkbox" checked={tune.shrinkToFit} onChange={(e) => setTune({ shrinkToFit: e.target.checked })} />
          Shrink to fit (keep the whole screen visible)
        </label>
        <div className="vr-row">
          <button className="btn primary" onClick={() => setTestPattern(true)}>
            Test pattern in the viewer
          </button>
          <button
            className="btn"
            onClick={() => {
              if (confirm('Reset fine-tune for this viewer?')) setTune({ ...DEFAULT_TUNE });
            }}
          >
            Reset
          </button>
        </div>
      </section>
    </div>
  );
}
