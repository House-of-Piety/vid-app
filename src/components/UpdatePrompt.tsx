import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Shows "Update available — Reload" when a new service worker is waiting.
 * Never reloads on its own, so playback is never interrupted.
 */
export function UpdatePrompt() {
  const [need, setNeed] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const update = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    update.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeed(true),
      onOfflineReady: () => setOfflineReady(true),
      onRegisteredSW(_url, reg) {
        // Check for updates every hour while the app is open.
        if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      },
    });
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const id = window.setTimeout(() => setOfflineReady(false), 5000);
    return () => window.clearTimeout(id);
  }, [offlineReady]);

  if (need)
    return (
      <div className="update-bar" role="status">
        <span>Update available</span>
        <button className="btn primary" onClick={() => void update.current?.(true)}>
          Reload
        </button>
        <button className="btn" onClick={() => setNeed(false)}>
          Later
        </button>
      </div>
    );
  if (offlineReady)
    return (
      <div className="update-bar" role="status">
        <span>Ready to work offline</span>
      </div>
    );
  return null;
}
