import { Icon } from './Icons';
import { VRSettings } from '../vr/ui/VRSettings';

export function VRSettingsScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="page">
      <header className="page-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>VR viewer settings</h1>
      </header>
      <VRSettings />
    </div>
  );
}
