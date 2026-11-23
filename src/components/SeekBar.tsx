import { useRef, useState } from 'react';
import type { Chapter } from '../lib/chapters/types';
import { chapterIndexAt, formatTime } from '../lib/chapterNav';

interface Props {
  current: number;
  duration: number;
  chapters: Chapter[];
  onSeek: (t: number) => void;
  /** Called continuously while dragging (for a live preview). */
  onScrub?: (t: number | null) => void;
}

/** Seek bar with chapter tick marks and a hover/drag tooltip (time + chapter title). */
export function SeekBar({ current, duration, chapters, onSeek, onScrub }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dur = duration > 0 && Number.isFinite(duration) ? duration : 0;

  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { t: f * dur, x: f * r.width };
  };

  const shown = drag ?? current;
  const pct = dur ? (shown / dur) * 100 : 0;
  const tip = hover ?? (drag !== null && ref.current ? { t: drag, x: (drag / (dur || 1)) * ref.current.clientWidth } : null);
  const tipChapter = tip && chapters.length ? chapters[chapterIndexAt(chapters, tip.t)]?.title : '';

  const step = (delta: number) => onSeek(Math.min(dur, Math.max(0, current + delta)));

  return (
    <div
      ref={ref}
      className="seek"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(dur)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatTime(shown)} of ${formatTime(dur)}`}
      onKeyDown={(e) => {
        // Arrow keys are handled globally by the player; Home/End/Page keys here.
        if (e.key === 'Home') { onSeek(0); e.preventDefault(); }
        else if (e.key === 'End') { onSeek(Math.max(0, dur - 1)); e.preventDefault(); }
        else if (e.key === 'PageUp') { step(60); e.preventDefault(); }
        else if (e.key === 'PageDown') { step(-60); e.preventDefault(); }
      }}
      onPointerMove={(e) => {
        if (!dur) return;
        const p = timeAt(e.clientX);
        if (drag !== null) {
          setDrag(p.t);
          onScrub?.(p.t);
        }
        if (e.pointerType === 'mouse' || drag !== null) setHover(p);
      }}
      onPointerLeave={() => drag === null && setHover(null)}
      onPointerDown={(e) => {
        if (!dur) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const p = timeAt(e.clientX);
        setDrag(p.t);
        setHover(p);
        onScrub?.(p.t);
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        const p = timeAt(e.clientX);
        onSeek(p.t);
        setDrag(null);
        onScrub?.(null);
        if (e.pointerType !== 'mouse') setHover(null);
      }}
      onPointerCancel={() => {
        setDrag(null);
        setHover(null);
        onScrub?.(null);
      }}
    >
      <div className="seek-track">
        <div className="seek-fill" style={{ width: `${pct}%` }} />
        {dur > 0 &&
          chapters.slice(1).map((c, i) => <span key={i} className="seek-tick" style={{ left: `${(c.start / dur) * 100}%` }} />)}
        <div className="seek-thumb" style={{ left: `${pct}%` }} />
      </div>
      {tip && (
        <div className="seek-tip" style={{ left: tip.x }}>
          <b>{formatTime(tip.t)}</b>
          {tipChapter && <span>{tipChapter}</span>}
        </div>
      )}
    </div>
  );
}
