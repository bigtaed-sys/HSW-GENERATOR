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
      f.pattern.mode = 'none';
      f.led.mode = 'none';
    },
  },
  {
    id: 'wide-hex',
    name: 'presetWideHex',
    apply: (f) => {
      Object.assign(f, { width: 40, mode: 'separate', style: 'classic', proud: 3, innerChamfer: 2, innerProfile: 'round' });
      Object.assign(f.pattern, { mode: 'hex', size: 9, rib: 1.6, depth: 0.8, margin: 4 });
      f.led.mode = 'none';
    },
  },
  {
    id: 'hex-lit',
    name: 'presetLit',
    apply: (f) => {
      Object.assign(f, { width: 60, mode: 'integrated', style: 'classic', proud: 4, innerChamfer: 3, innerProfile: 'round' });
      f.styleParams = { ...f.styleParams, classic: { ...f.styleParams.classic, profile: 2, size: 4 } };
      // The strip lives in the hollow under the frame and shines through the thin groove floors.
      Object.assign(f.pattern, { mode: 'lit', rib: 2.4, margin: 2.5, plate: 3, skin: 0.6 });
      f.led.mode = 'none';
    },
  },
];
