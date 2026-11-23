import { useMemo, useRef, useState } from 'react';
import { CARD_WIDTH_MM, PHONES, calibratedScreen, detectPhones, type PhoneScreen } from '../screens';

interface Props {
  value: PhoneScreen | null;
  onChange: (p: PhoneScreen) => void;
}

/** Choose the iPhone model (physical screen size), or calibrate with a bank card. */
export function PhonePicker({ value, onChange }: Props) {
  const detected = useMemo(() => detectPhones(screen.width, screen.height), []);
  const [calibrating, setCalibrating] = useState(false);
  const [barPx, setBarPx] = useState(320);
  const drag = useRef<{ x: number; w: number } | null>(null);

  return (
    <div className="vr-phone">
      <label className="vr-field">
        <span>Phone model</span>
        <select
          value={value?.id ?? ''}
          onChange={(e) => {
            const p = PHONES.find((x) => x.id === e.target.value);
            if (p) onChange(p);
          }}
        >
          <option value="" disabled>
            Choose…
          </option>
          {value?.id === 'calibrated' && <option value="calibrated">{value.name}</option>}
          {PHONES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {detected.some((d) => d.id === p.id) ? ' (matches this device)' : ''}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <p className="vr-muted">
          Screen {value.heightMm.toFixed(1)} × {value.widthMm.toFixed(1)} mm ({value.heightPx} × {value.widthPx} px)
        </p>
      )}
      {!value && detected.length > 0 && (
        <p className="vr-muted">This screen size matches: {detected.map((d) => d.name).join('; ')}.</p>
      )}
      {!calibrating ? (
        <button className="vr-link" onClick={() => setCalibrating(true)}>
          Not listed? Calibrate with a bank card
        </button>
      ) : (
        <div className="vr-calib">
          <p>
            Hold a bank card (or any ID-1 card, {CARD_WIDTH_MM} mm wide) flat against the screen, and drag the bar's right end until it is
            exactly as wide as the card.
          </p>
          <div
            className="vr-calib-bar"
            style={{ width: barPx }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, w: barPx };
            }}
            onPointerMove={(e) => {
              if (drag.current) setBarPx(Math.max(120, Math.min(window.innerWidth - 24, drag.current.w + e.clientX - drag.current.x)));
            }}
            onPointerUp={() => (drag.current = null)}
            role="slider"
            aria-label="Card width"
            aria-valuenow={Math.round(barPx)}
            aria-valuemin={120}
            aria-valuemax={window.innerWidth}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setBarPx((w) => w + (e.shiftKey ? 10 : 1));
              if (e.key === 'ArrowLeft') setBarPx((w) => w - (e.shiftKey ? 10 : 1));
            }}
          >
            <span className="vr-calib-handle" />
          </div>
          <div className="vr-row">
            <button className="btn" onClick={() => setBarPx((w) => w - 1)}>
              −1 px
            </button>
            <button className="btn" onClick={() => setBarPx((w) => w + 1)}>
              +1 px
            </button>
            <button
              className="btn primary"
              onClick={() => {
                onChange(calibratedScreen(barPx, screen.width, screen.height));
                setCalibrating(false);
              }}
            >
              Use this size
            </button>
            <button className="btn" onClick={() => setCalibrating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
