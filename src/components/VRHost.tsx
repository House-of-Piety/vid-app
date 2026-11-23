import { useEffect, useRef, useState } from 'react';
import { VRView } from '../vr/ui/VRView';
import { drawCover } from '../lib/cover';

export interface VRHostProps {
  media: HTMLMediaElement | null;
  isVideo: boolean;
  title: string;
  getState: () => { playing: boolean; progress: number; chapterTitle: string; caption: string };
  actions: { togglePlay: () => void; prevChapter: () => void; nextChapter: () => void };
  onExit: () => void;
}

/**
 * Connects the player to the VR module: video goes straight in as a texture; audio gets a generated
 * cover (title, chapter, caption, progress) drawn into a canvas that is refreshed a few times a second.
 */
export function VRHost({ media, isVideo, title, getState, actions, onExit }: VRHostProps) {
  const [cover] = useState(() => {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    return c;
  });
  const [version, setVersion] = useState(0);
  const last = useRef('');

  useEffect(() => {
    if (isVideo) return;
    const draw = () => {
      const st = getState();
      const key = `${st.chapterTitle}|${st.caption}|${Math.round(st.progress * 300)}`;
      if (key === last.current) return;
      last.current = key;
      drawCover(cover, { title, chapter: st.chapterTitle, caption: st.caption, progress: st.progress });
      setVersion((v) => v + 1);
    };
    draw();
    const id = window.setInterval(draw, 250);
    return () => window.clearInterval(id);
  }, [isVideo, cover, title, getState]);

  return (
    <VRView
      source={isVideo ? (media as HTMLVideoElement | null) : cover}
      sourceVersion={version}
      isVideo={isVideo}
      playback={{
        getState,
        prev: actions.prevChapter,
        next: actions.nextChapter,
        togglePlay: actions.togglePlay,
      }}
      onExit={onExit}
    />
  );
}
