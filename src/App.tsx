import { useCallback, useEffect, useState } from 'react';
import type { MediaItem } from './lib/media';
import { Home } from './components/Home';
import { Player } from './components/Player';
import { Help } from './components/Help';
import { UpdatePrompt } from './components/UpdatePrompt';
import { VRSettingsScreen } from './components/VRSettingsScreen';

type Screen = { name: 'home' } | { name: 'player'; item: MediaItem } | { name: 'help' } | { name: 'vr-settings' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [dropped, setDropped] = useState<File[] | null>(null);
  const [dragging, setDragging] = useState(false);

  // Browser back button returns to the library.
  const go = useCallback((s: Screen) => {
    if (s.name !== 'home') history.pushState({ screen: s.name }, '');
    setScreen(s);
  }, []);
  const back = useCallback(() => {
    if (history.state?.screen) history.back();
    else setScreen({ name: 'home' });
  }, []);
  useEffect(() => {
    const onPop = () => setScreen({ name: 'home' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Drag-and-drop anywhere (PC).
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) {
        setDropped(files);
        setScreen({ name: 'home' });
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <>
      {/* Home stays mounted so opened files and the scanned library survive visits to other screens. */}
      <div hidden={screen.name !== 'home'}>
        <Home
          visible={screen.name === 'home'}
          onOpen={(item) => go({ name: 'player', item })}
          onHelp={() => go({ name: 'help' })}
          onVRSettings={() => go({ name: 'vr-settings' })}
          dropped={dropped}
          onDroppedHandled={() => setDropped(null)}
        />
      </div>
      {screen.name === 'player' && <Player key={screen.item.id} item={screen.item} onClose={back} />}
      {screen.name === 'help' && <Help onClose={back} />}
      {screen.name === 'vr-settings' && <VRSettingsScreen onClose={back} />}
      {dragging && <div className="drop-overlay">Drop audio/video files (and their .vtt files)</div>}
      <UpdatePrompt />
    </>
  );
}
