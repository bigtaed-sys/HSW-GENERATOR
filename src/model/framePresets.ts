import type { FrameSettings } from './types';

export interface FramePreset {
  id: string;
  /** i18n key of the name. */
  name: string;
  apply: (f: FrameSettings) => void;
}

/** One-click frame looks. Each preset sets only what defines the look. */
export const FRAME_PRESETS: FramePreset[] = [
  {
    id: 'slim',
    name: 'presetSlim',
    apply: (f) => {
      Object.assign(f, { width: 18, mode: 'separate', style: 'classic', proud: 2, innerChamfer: 0.6, innerProfile: 'chamfer' });
      f.led.mode = 'none';
    },
  },
  {
    id: 'wide-hex',
    name: 'presetWideHex',
    apply: (f) => {
      Object.assign(f, { width: 40, mode: 'separate', style: 'cells', proud: 3, innerChamfer: 2, innerProfile: 'round' });
      f.led.mode = 'none';
    },
  },
  {
    id: 'hex-lit',
    name: 'presetLit',
    apply: (f) => {
      Object.assign(f, { width: 60, mode: 'integrated', style: 'lit', proud: 4, innerChamfer: 3, innerProfile: 'round' });
      // The strip lives in the hollow under the frame and shines through the thin groove floors.
      f.led.mode = 'none';
    },
  },
];
