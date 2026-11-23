import { Icon } from './Icons';

/** Placeholder until the VR step lands. */
export function VRSettingsScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>VR viewer</h1>
      </header>
      <p className="muted">Coming soon.</p>
    </div>
  );
}
