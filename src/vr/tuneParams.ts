import type { FineTune } from './lens';

export interface TuneParam {
  key: Exclude<keyof FineTune, 'shrinkToFit'>;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const sign = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;

export const TUNE_PARAMS: TuneParam[] = [
  { key: 'ipdOffsetMm', label: 'Lens spacing (IPD)', min: -5, max: 5, step: 0.5, format: (v) => `${sign(v)} mm` },
  { key: 'verticalOffsetMm', label: 'Vertical offset', min: -8, max: 8, step: 0.5, format: (v) => `${sign(v)} mm` },
  { key: 'distortionScale', label: 'Distortion strength', min: 0, max: 1.5, step: 0.05, format: (v) => `${Math.round(v * 100)} %` },
  { key: 'zoom', label: 'Field of view / zoom', min: 0.6, max: 1.4, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: 'screenWidthM', label: 'Virtual screen size', min: 0.5, max: 12, step: 0.1, format: (v) => `${v.toFixed(1)} m wide` },
  { key: 'screenDistanceM', label: 'Virtual screen distance', min: 0.8, max: 8, step: 0.1, format: (v) => `${v.toFixed(1)} m` },
];

export function stepTune(t: FineTune, p: TuneParam, dir: 1 | -1): FineTune {
  const v = Math.round((t[p.key] + dir * p.step) / p.step) * p.step;
  return { ...t, [p.key]: Math.min(p.max, Math.max(p.min, Number(v.toFixed(4)))) };
}
