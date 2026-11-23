import { useEffect, useRef } from 'react';
import type { Chapter } from '../lib/chapters/types';
import { formatTime } from '../lib/chapterNav';
import { Icon } from './Icons';

interface Props {
  open: boolean;
  chapters: Chapter[];
  current: number;
  sourceLabel: string;
  onPick: (i: number) => void;
  onClose: () => void;
  onVR: () => void;
}

/** Side drawer on PC, bottom sheet on phones (CSS decides). */
export function ChaptersPanel({ open, chapters, current, sourceLabel, onPick, onClose, onVR }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ block: 'center' });
    (el?.querySelector('button') ?? listRef.current?.querySelector('button'))?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`chapters-panel ${open ? 'open' : ''}`} aria-label="Chapters" aria-hidden={!open} inert={!open}>
        <header>
          <div className="grab" aria-hidden="true" />
          <h2>Chapters</h2>
          <span className="muted small">{chapters.length ? `${chapters.length} · ${sourceLabel}` : ''}</span>
          <button className="icon-btn" onClick={onVR} aria-label="VR mode" title="VR mode">
            <Icon name="vr" />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close chapters">
            <Icon name="close" />
          </button>
        </header>
        {chapters.length === 0 ? (
          <p className="muted pad">No chapters</p>
        ) : (
          <ol ref={listRef}>
            {chapters.map((c, i) => (
              <li key={i} aria-current={i === current ? 'true' : undefined}>
                <button onClick={() => onPick(i)}>
                  <span className="ch-num">{i + 1}</span>
                  <span className="ch-title">{c.title}</span>
                  <span className="ch-time">
                    {formatTime(c.start)}
                    <small>{formatTime(c.end - c.start)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </>
  );
}
