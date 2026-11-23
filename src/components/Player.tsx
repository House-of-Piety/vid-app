import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../lib/media';
import { isIOS, playabilityProblem } from '../lib/media';
import { blobSource, loadChapters, parseVtt, cueText, type Chapter, type ChapterSource, type Cue } from '../lib/chapters';
import { chapterIndexAt, formatTime, nextChapterTime, prevChapterTime } from '../lib/chapterNav';
import { isFinished, resumeKey, resumePosition, type ResumeState } from '../lib/resume';
import { getResume, saveResume } from '../lib/resumeStore';
import { displayTitle, drawCover, hashHue } from '../lib/cover';
import { Icon } from './Icons';
import { SeekBar } from './SeekBar';
import { ChaptersPanel } from './ChaptersPanel';
import { VRHost } from './VRHost';

interface Props {
  item: MediaItem;
  onClose: () => void;
}

const SOURCE_LABEL: Record<ChapterSource, string> = {
  vtt: 'from .chapters.vtt',
  chpl: 'embedded (Nero)',
  'qt-track': 'embedded (QuickTime)',
  id3: 'embedded (ID3)',
  none: '',
};

const SAVE_EVERY_MS = 5000;
const HIDE_AFTER_MS = 3000;
const clampRate = (r: number) => Math.round(Math.min(3, Math.max(0.5, r)) * 10) / 10;

type MediaEl = HTMLVideoElement;

export function Player({ item, onClose }: Props) {
  const ios = useMemo(isIOS, []);
  const isVideo = item.kind === 'video';
  const mediaRef = useRef<MediaEl>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [url, setUrl] = useState<string>();
  const [captionsUrl, setCaptionsUrl] = useState<string>();
  const [error, setError] = useState<string | null>(() => playabilityProblem(item.name));
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterSource, setChapterSource] = useState<ChapterSource>('none');
  const [cues, setCues] = useState<Cue[]>([]);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [panel, setPanel] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [toast, setToast] = useState<{ at: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [vr, setVr] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);

  const fileRef = useRef<File | null>(null);
  const keyRef = useRef<string | null>(null);
  const savedRef = useRef<ResumeState | null>(null);
  const readyRef = useRef(false);
  const lastElRef = useRef<HTMLMediaElement | null>(null);
  const skipSeekSaveRef = useRef(false);
  const chaptersRef = useRef<Chapter[]>([]);
  const lastIdxRef = useRef(-1);
  chaptersRef.current = chapters;

  const chapterIdx = chapterIndexAt(chapters, scrub ?? time);
  const chapter = chapterIdx >= 0 ? chapters[chapterIdx] : undefined;
  const title = displayTitle(item.name);

  // ---------- loading ----------
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    readyRef.current = false;
    keyRef.current = null;
    (async () => {
      const file = await item.getFile();
      if (cancelled) return;
      fileRef.current = file;
      const u = URL.createObjectURL(file);
      urls.push(u);
      setUrl(u);
      const [chText, capText] = await Promise.all([
        item.getChaptersVtt?.().then((f) => f.text()).catch(() => null) ?? null,
        item.getCaptionsVtt?.().then((f) => f.text()).catch(() => null) ?? null,
      ]);
      const res = await loadChapters(blobSource(file), chText);
      if (cancelled) return;
      setChapters(res.chapters);
      setChapterSource(res.source);
      if (capText) {
        setCues(parseVtt(capText));
        if (isVideo) {
          const cu = URL.createObjectURL(new Blob([capText], { type: 'text/vtt' }));
          urls.push(cu);
          setCaptionsUrl(cu);
        }
      }
    })().catch((e) => !cancelled && setError(`Couldn't open the file: ${e instanceof Error ? e.message : e}`));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [item, isVideo]);

  // ---------- saving ----------
  const save = useCallback(() => {
    // lastElRef: React detaches mediaRef before unmount cleanups run, but the element still knows its position.
    const el = mediaRef.current ?? lastElRef.current;
    const key = keyRef.current;
    if (!el || !key || !readyRef.current) return;
    const d = el.duration;
    const pos = el.currentTime;
    const idx = chapterIndexAt(chaptersRef.current, pos);
    const state: ResumeState = {
      key,
      name: item.name,
      folder: item.folder,
      size: fileRef.current?.size ?? item.size,
      position: pos,
      duration: Number.isFinite(d) ? d : 0,
      chapterIndex: idx,
      chapterTitle: chaptersRef.current[idx]?.title ?? '',
      playbackRate: el.playbackRate,
      volume: el.volume,
      updatedAt: Date.now(),
      finished: el.ended || isFinished(pos, d),
      importedId: item.importedId ?? savedRef.current?.importedId,
    };
    savedRef.current = state;
    void saveResume(state);
  }, [item]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(save, SAVE_EVERY_MS);
    return () => window.clearInterval(id);
  }, [playing, save]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save(); // leaving the player
      lastElRef.current?.pause(); // a detached media element would otherwise keep playing
    };
  }, [save]);

  // ---------- media events ----------
  const onLoadedMetadata = async () => {
    const el = mediaRef.current!;
    lastElRef.current = el;
    const file = fileRef.current;
    const d = el.duration;
    setDuration(d);
    if (!file) return;
    const key = resumeKey(item.name, file.size, d);
    keyRef.current = key;
    const saved = await getResume(key);
    savedRef.current = saved;
    if (saved) {
      const r = clampRate(saved.playbackRate || 1);
      el.playbackRate = r;
      el.defaultPlaybackRate = r;
      setRate(r);
      if (!ios && saved.volume >= 0 && saved.volume <= 1) {
        el.volume = saved.volume;
        setVolume(saved.volume);
      }
    }
    const pos = resumePosition(saved, d);
    if (pos > 0) {
      skipSeekSaveRef.current = true;
      el.currentTime = pos;
      setTime(pos);
      setToast({ at: pos });
    }
    readyRef.current = true;
    el.play().catch(() => undefined);
  };

  const onTimeUpdate = () => {
    const el = mediaRef.current!;
    setTime(el.currentTime);
    const idx = chapterIndexAt(chaptersRef.current, el.currentTime);
    if (idx !== lastIdxRef.current) {
      const first = lastIdxRef.current === -1;
      lastIdxRef.current = idx;
      if (!first) save();
    }
  };

  const onMediaError = () => {
    const el = mediaRef.current;
    const code = el?.error?.code;
    setError(
      playabilityProblem(item.name) ??
        (code === 4
          ? `${ios ? 'iPhone' : 'This browser'} can't play this file (${item.ext.toUpperCase()}). The format or codec isn't supported.`
          : `Playback failed${el?.error?.message ? `: ${el.error.message}` : '.'}`),
    );
  };

  // ---------- actions ----------
  const seekTo = useCallback((t: number) => {
    const el = mediaRef.current;
    if (!el) return;
    const d = Number.isFinite(el.duration) ? el.duration : t;
    el.currentTime = Math.min(Math.max(0, t), Math.max(0, d - 0.05));
    setTime(el.currentTime);
  }, []);
  const skip = useCallback((delta: number) => seekTo((mediaRef.current?.currentTime ?? 0) + delta), [seekTo]);
  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);
  const prevChapter = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (!chaptersRef.current.length) return seekTo(0);
    seekTo(prevChapterTime(chaptersRef.current, el.currentTime));
  }, [seekTo]);
  const nextChapter = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const t = nextChapterTime(chaptersRef.current, el.currentTime);
    if (t !== null) seekTo(t);
  }, [seekTo]);
  const playChapter = useCallback(
    (i: number) => {
      const c = chaptersRef.current[i];
      if (!c) return;
      seekTo(c.start);
      void mediaRef.current?.play().catch(() => undefined);
    },
    [seekTo],
  );
  const setSpeed = useCallback(
    (r: number) => {
      const el = mediaRef.current;
      const v = clampRate(r);
      if (el) {
        el.playbackRate = v;
        el.defaultPlaybackRate = v;
      }
      setRate(v);
      save();
    },
    [save],
  );
  const changeVolume = useCallback((v: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, v));
    if (el.volume > 0) el.muted = false;
  }, []);
  const toggleMute = useCallback(() => {
    const el = mediaRef.current;
    if (el) el.muted = !el.muted;
  }, []);
  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    const el = mediaRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (root?.requestFullscreen) void root.requestFullscreen().catch(() => el?.webkitEnterFullscreen?.());
    else el?.webkitEnterFullscreen?.(); // iPhone: only the video element can go fullscreen
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---------- captions ----------
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !isVideo) return;
    const apply = () => {
      for (const t of Array.from(el.textTracks)) t.mode = captionsOn ? 'showing' : 'hidden';
    };
    apply();
    el.textTracks.addEventListener?.('addtrack', apply);
    return () => el.textTracks.removeEventListener?.('addtrack', apply);
  }, [captionsOn, captionsUrl, isVideo]);

  const activeCue = useMemo(() => {
    if (!cues.length) return '';
    const c = cues.find((q) => q.start <= time && time < q.end);
    return c ? cueText(c.text) : '';
  }, [cues, time]);

  // ---------- Media Session (lock screen, headphones, AirPods) ----------
  const artwork = useMemo(() => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      drawCover(c, { title, chapter: '', caption: '', progress: 0 });
      return [{ src: c.toDataURL('image/png'), sizes: '512x512', type: 'image/png' }];
    } catch {
      return [];
    }
  }, [title]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: chapter?.title ?? '',
      album: item.folder || 'Chapter Player',
      artwork,
    });
  }, [title, chapter?.title, item.folder, artwork]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* unsupported action */
      }
    };
    set('play', () => void mediaRef.current?.play());
    set('pause', () => mediaRef.current?.pause());
    set('seekbackward', (d) => skip(-(d.seekOffset || 10)));
    set('seekforward', (d) => skip(d.seekOffset || 30));
    set('seekto', (d) => d.seekTime !== undefined && seekTo(d.seekTime));
    set('previoustrack', prevChapter);
    set('nexttrack', nextChapter);
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as MediaSessionAction[]) set(a, null);
    };
  }, [skip, seekTo, prevChapter, nextChapter]);

  const syncPosition = useCallback(() => {
    const el = mediaRef.current;
    if (!el || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const d = el.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration: d, playbackRate: el.playbackRate || 1, position: Math.min(el.currentTime, d) });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    syncPosition();
  }, [playing, syncPosition]);

  // keep the lock-screen scrubber accurate even if timeupdate is throttled
  useEffect(() => {
    const id = window.setInterval(syncPosition, 5000);
    return () => window.clearInterval(id);
  }, [syncPosition]);

  // ---------- auto-hide controls over video ----------
  const hideTimer = useRef<number>(0);
  const poke = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    if (isVideo) {
      hideTimer.current = window.setTimeout(() => {
        const el = mediaRef.current;
        if (el && !el.paused) setControlsVisible(false);
      }, HIDE_AFTER_MS);
    }
  }, [isVideo]);
  useEffect(() => {
    if (!playing || panel || speedOpen) {
      window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
    } else poke();
  }, [playing, panel, speedOpen, poke]);

  // ---------- keyboard ----------
  useEffect(() => {
    if (vr) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = mediaRef.current;
      let handled = true;
      switch (e.key) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) prevChapter();
          else skip(-10);
          break;
        case 'ArrowRight':
          if (e.shiftKey) nextChapter();
          else skip(10);
          break;
        case 'ArrowUp':
          if (el && !ios) changeVolume(el.volume + 0.05);
          break;
        case 'ArrowDown':
          if (el && !ios) changeVolume(el.volume - 0.05);
          break;
        case '[':
          setSpeed((el?.playbackRate ?? 1) - 0.1);
          break;
        case ']':
          setSpeed((el?.playbackRate ?? 1) + 0.1);
          break;
        case '=':
          setSpeed(1);
          break;
        case 'f':
        case 'F':
          if (isVideo) toggleFullscreen();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'c':
        case 'C':
          setPanel((p) => !p);
          break;
        case 'Escape':
          if (panel || speedOpen) {
            setPanel(false);
            setSpeedOpen(false);
          } else if (toast) setToast(null);
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vr, ios, isVideo, panel, speedOpen, toast, togglePlay, prevChapter, nextChapter, skip, changeVolume, setSpeed, toggleFullscreen, toggleMute, poke]);

  // ---------- touch: double-tap left/right third ----------
  const lastTap = useRef<{ t: number; zone: number }>({ t: 0, zone: -1 });
  const singleTapTimer = useRef<number>(0);
  const [tapFlash, setTapFlash] = useState<{ zone: number; n: number } | null>(null);
  const onStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, .seek')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const zone = Math.min(2, Math.floor(((e.clientX - r.left) / r.width) * 3));
    const now = performance.now();
    if (e.pointerType === 'mouse') {
      if (isVideo) togglePlay();
      poke();
      return;
    }
    if (isVideo && now - lastTap.current.t < 300 && zone === lastTap.current.zone && zone !== 1) {
      window.clearTimeout(singleTapTimer.current);
      skip(zone === 0 ? -10 : 10);
      setTapFlash((f) => ({ zone, n: (f?.n ?? 0) + 1 }));
      lastTap.current = { t: now, zone };
      return;
    }
    lastTap.current = { t: now, zone };
    window.clearTimeout(singleTapTimer.current);
    singleTapTimer.current = window.setTimeout(() => {
      if (!isVideo) return;
      if (controlsVisible && playing) setControlsVisible(false);
      else poke();
    }, 280);
  };
  useEffect(() => {
    if (!tapFlash) return;
    const id = window.setTimeout(() => setTapFlash(null), 600);
    return () => window.clearTimeout(id);
  }, [tapFlash]);

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const toastChapter = toast && chapters.length ? chapters[chapterIndexAt(chapters, toast.at)] : undefined;
  const shownTime = scrub ?? time;
  const hue = hashHue(title);
  const hidden = isVideo && !controlsVisible;

  return (
    <div
      ref={rootRef}
      className={`player ${isVideo ? 'is-video' : 'is-audio'} ${hidden ? 'chrome-hidden' : ''}`}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
    >
      <header className="player-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back to library">
          <Icon name="back" />
        </button>
        <div className="player-title">
          <h1 title={item.name}>{title}</h1>
          <span className="muted small">
            {chapters.length ? `Chapter ${chapterIdx + 1} of ${chapters.length}` : chapterSource === 'none' && url ? 'No chapters' : ''}
            {chapter ? ` · ${chapter.title}` : ''}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setVr(true)} aria-label="VR mode" title="VR mode">
          <Icon name="vr" />
        </button>
      </header>

      <div className="stage" onPointerUp={onStagePointerUp}>
        {isVideo ? (
          <video
            ref={mediaRef}
            src={url}
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              save();
            }}
            onEnded={() => {
              setPlaying(false);
              save();
            }}
            onSeeked={() => {
              if (skipSeekSaveRef.current) skipSeekSaveRef.current = false;
              else save();
              syncPosition();
            }}
            onRateChange={(e) => {
              setRate(clampRate(e.currentTarget.playbackRate));
              syncPosition();
            }}
            onVolumeChange={(e) => {
              setVolume(e.currentTarget.volume);
              setMuted(e.currentTarget.muted);
            }}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onError={onMediaError}
          >
            {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="und" label="Captions" default />}
          </video>
        ) : (
          <>
            <audio
              ref={mediaRef as unknown as React.RefObject<HTMLAudioElement>}
              src={url}
              preload="metadata"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false);
                save();
              }}
              onEnded={() => {
                setPlaying(false);
                save();
              }}
              onSeeked={() => {
                if (skipSeekSaveRef.current) skipSeekSaveRef.current = false;
                else save();
                syncPosition();
              }}
              onRateChange={(e) => {
                setRate(clampRate(e.currentTarget.playbackRate));
                syncPosition();
              }}
              onVolumeChange={(e) => {
                setVolume(e.currentTarget.volume);
                setMuted(e.currentTarget.muted);
              }}
              onDurationChange={(e) => setDuration(e.currentTarget.duration)}
              onError={onMediaError}
            />
            <div className="cover-wrap">
              <div
                className="cover"
                style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 24%), hsl(${(hue + 40) % 360} 50% 10%))` }}
              >
                <div className="cover-title">{title}</div>
                <div className="cover-chapter">{chapter?.title ?? (chapterSource === 'none' && url ? 'No chapters' : '')}</div>
              </div>
              {cues.length > 0 && captionsOn && (
                <p className="transcript" aria-live="polite">
                  {activeCue || ' '}
                </p>
              )}
            </div>
          </>
        )}
        {tapFlash && (
          <div key={tapFlash.n} className={`tap-flash ${tapFlash.zone === 0 ? 'left' : 'right'}`} aria-hidden="true">
            {tapFlash.zone === 0 ? '−10 s' : '+10 s'}
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button className="btn" onClick={onClose}>
              Back
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>
            Resumed at {formatTime(toast.at)}
            {toastChapter ? ` — ${toastChapter.title}` : ''}
          </span>
          <button
            className="btn"
            onClick={() => {
              seekTo(0);
              setToast(null);
            }}
          >
            Start over
          </button>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}

      <div className="controls" onPointerDown={poke}>
        <div className="seek-row">
          <SeekBar current={time} duration={duration} chapters={chapters} onSeek={seekTo} onScrub={setScrub} />
        </div>
        <div className="button-row">
          <div className="group">
            <button className="icon-btn" onClick={prevChapter} aria-label="Previous chapter" title="Previous chapter (Shift+←)">
              <Icon name="prev" />
            </button>
            <button className="icon-btn" onClick={() => skip(-10)} aria-label="Back 10 seconds" title="Back 10 s (←)">
              <Icon name="back10" />
            </button>
            <button className="icon-btn play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title="Play/pause (Space)">
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button className="icon-btn" onClick={() => skip(30)} aria-label="Forward 30 seconds" title="Forward 30 s">
              <Icon name="fwd30" />
            </button>
            <button className="icon-btn" onClick={nextChapter} aria-label="Next chapter" title="Next chapter (Shift+→)">
              <Icon name="next" />
            </button>
          </div>
          <button
            className="time"
            onClick={() => setShowRemaining((s) => !s)}
            aria-label={showRemaining ? 'Showing remaining time; show elapsed' : 'Showing elapsed time; show remaining'}
          >
            {showRemaining ? `−${formatTime(Math.max(0, duration - shownTime))}` : formatTime(shownTime)}
            <span className="muted"> / {formatTime(duration)}</span>
          </button>
          {chapters.length > 0 && (
            <span className="chapter-count muted small">
              Ch. {chapterIdx + 1}/{chapters.length}
            </span>
          )}
          <div className="spacer" />
          <div className="group">
            <div className="speed-wrap">
              <button
                className={`speed-btn ${rate !== 1 ? 'on' : ''}`}
                onClick={() => setSpeedOpen((o) => !o)}
                aria-label={`Playback speed ${rate.toFixed(1)}×`}
                aria-expanded={speedOpen}
                title="Speed ([ ] =)"
              >
                {rate.toFixed(1)}×
              </button>
              {speedOpen && (
                <div className="popover speed-pop" role="dialog" aria-label="Playback speed">
                  <button className="icon-btn" onClick={() => setSpeed(rate - 0.1)} aria-label="Slower">
                    −
                  </button>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={rate}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    aria-label="Speed"
                  />
                  <button className="icon-btn" onClick={() => setSpeed(rate + 0.1)} aria-label="Faster">
                    +
                  </button>
                  <button className="btn" onClick={() => setSpeed(1)}>
                    1.0×
                  </button>
                </div>
              )}
            </div>
            {!ios && (
              <div className="volume">
                <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (M)">
                  <Icon name={muted || volume === 0 ? 'mute' : 'volume'} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                />
              </div>
            )}
            {cues.length > 0 && (
              <button
                className={`icon-btn ${captionsOn ? 'on' : ''}`}
                onClick={() => setCaptionsOn((c) => !c)}
                aria-pressed={captionsOn}
                aria-label="Captions"
                title="Captions"
              >
                <Icon name="captions" />
              </button>
            )}
            <button className={`icon-btn ${panel ? 'on' : ''}`} onClick={() => setPanel((p) => !p)} aria-label="Chapters" title="Chapters (C)">
              <Icon name="chapters" />
            </button>
            {isVideo && (
              <button className="icon-btn" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
                <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} />
              </button>
            )}
          </div>
        </div>
      </div>

      <ChaptersPanel
        open={panel}
        chapters={chapters}
        current={chapterIdx}
        sourceLabel={SOURCE_LABEL[chapterSource]}
        onPick={(i) => {
          playChapter(i);
          if (window.matchMedia('(max-width: 700px)').matches) setPanel(false);
        }}
        onClose={() => setPanel(false)}
        onVR={() => {
          setPanel(false);
          setVr(true);
        }}
      />

      {vr && (
        <VRHost
          media={mediaRef.current}
          isVideo={isVideo}
          title={title}
          getState={() => {
            const el = mediaRef.current;
            const t = el?.currentTime ?? 0;
            const d = el?.duration ?? 0;
            const i = chapterIndexAt(chaptersRef.current, t);
            const cue = cues.find((q) => q.start <= t && t < q.end);
            return {
              playing: !!el && !el.paused,
              progress: d > 0 ? t / d : 0,
              chapterTitle: chaptersRef.current[i]?.title ?? '',
              caption: captionsOn && cue ? cueText(cue.text) : '',
            };
          }}
          actions={{ togglePlay, prevChapter, nextChapter }}
          onExit={() => setVr(false)}
        />
      )}
    </div>
  );
}
