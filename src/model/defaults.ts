import type { Project } from './types';

export interface PrinterPreset {
  id: string;
  name: string;
  w: number;
  h: number;
}

export const PRINTERS: PrinterPreset[] = [
  { id: 'bambu-x1', name: 'Bambu Lab X1 / P1 / A1', w: 256, h: 256 },
  { id: 'bambu-a1mini', name: 'Bambu Lab A1 mini', w: 180, h: 180 },
  { id: 'bambu-h2d', name: 'Bambu Lab H2D', w: 325, h: 320 },
  { id: 'prusa-mk4', name: 'Prusa MK4 / MK3S', w: 250, h: 210 },
  { id: 'prusa-core', name: 'Prusa CORE One', w: 250, h: 220 },
  { id: 'prusa-mini', name: 'Prusa MINI', w: 180, h: 180 },
  { id: 'prusa-xl', name: 'Prusa XL', w: 360, h: 360 },
  { id: 'ender3', name: 'Creality Ender 3 (V2/V3)', w: 220, h: 220 },
  { id: 'k1', name: 'Creality K1 / K1C', w: 220, h: 220 },
  { id: 'k1max', name: 'Creality K1 Max', w: 300, h: 300 },
  { id: 'voron350', name: 'Voron 2.4 350', w: 350, h: 350 },
  { id: 'custom', name: 'Custom', w: 200, h: 200 },
];

export const PALETTE = [
  '#f2a93b',
  '#e5484d',
  '#3e9b4f',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f5f5f4',
  '#57534e',
  '#1c1917',
];

export function defaultProject(): Project {
  return {
    version: 1,
    name: 'My HSW wall',
    wall: { shape: 'rect', width: 900, height: 600, cornerRadius: 24 },
    frame: {
      width: 18,
      mode: 'separate',
      style: 'classic',
      styleParams: {},
      proud: 2,
      lip: 4,
      innerChamfer: 0.6,
      screws: true,
      joint: 'lap',
      jointLength: 40,
      led: { mode: 'none', width: 12, depth: 3, wire: true },
    },
    grid: { mode: 'whole', minEdge: 1.8, minPartial: 0.3, offsetX: 0, offsetY: 0, flipStagger: false },
    mount: { mode: 'connectors', junctions: true, seams: false, spacing: 150, edges: true, edgeSpacing: 250, minPerPanel: 1, perPanel: 4, screwDiameter: 4, headDiameter: 8, floor: 2.4 },
    cells: {},
    cutouts: [],
    printer: { preset: 'bambu-x1', bedW: 256, bedH: 256, margin: 5, holeTolerance: 0, insertTolerance: 0, engrave: true },
    accessories: [],
    customModels: [],
    colors: { panel: '#2b2d31', frame: '#c8a27a', connector: '#8f949b' },
  };
}
