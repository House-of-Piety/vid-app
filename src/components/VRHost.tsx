export interface VRHostProps {
  media: HTMLMediaElement | null;
  isVideo: boolean;
  title: string;
  getState: () => { playing: boolean; progress: number; chapterTitle: string; caption: string };
  actions: { togglePlay: () => void; prevChapter: () => void; nextChapter: () => void };
  onExit: () => void;
}

/** Placeholder until the VR step lands. */
export function VRHost({ onExit }: VRHostProps) {
  return (
    <div className="vr-host" onClick={onExit}>
      VR mode is coming in a later step. Tap to go back.
    </div>
  );
}
