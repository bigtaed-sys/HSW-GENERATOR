// All dimensions are in millimetres. The wall lives in the XY plane with the
// origin at the wall centre, +Y up and +Z pointing out of the wall (towards the viewer).

export type Lang = 'ru' | 'en';

export type WallShape = 'rect' | 'hexagon' | 'ellipse' | 'honeycomb';
export type EdgeProfile = 'square' | 'chamfer' | 'round';
export type CellMode = 'whole' | 'partial';
export type CellOverride = 'solid' | 'mount' | 'open';

export interface WallSettings {
  shape: WallShape;
  width: number;
  height: number;
  cornerRadius: number;
}

export interface FrameSettings {
  width: number; // 0 = no frame
  profile: EdgeProfile;
  profileSize: number;
  proud: number; // how far the frame front stands out over the grid front
  innerChamfer: number;
  screws: boolean;
}

export interface GridSettings {
  mode: CellMode;
  minEdge: number; // minimum solid material between a cell and an edge
  minPartial: number; // 0..1, smallest kept fraction of a clipped cell
  offsetX: number;
  offsetY: number;
  flipStagger: boolean;
}

export interface MountSettings {
  perPanel: number; // automatically placed screw cells per panel
  screwDiameter: number;
  headDiameter: number;
  floor: number;
}

export interface Cutout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  rim: number;
  chamfer: number;
}

export interface PrinterSettings {
  preset: string;
  bedW: number;
  bedH: number;
  margin: number;
}

export interface CellRef {
  c: number;
  r: number;
}

export interface Accessory {
  id: string;
  type: string;
  c: number;
  r: number;
  params: Record<string, number>;
  color: string;
}

export interface CustomModel {
  id: string;
  name: string;
  stl: string; // base64 binary STL
  c: number;
  r: number;
  rot: [number, number, number]; // quarter turns around X, Y, Z
  offset: [number, number, number];
  color: string;
}

export interface Project {
  version: 1;
  name: string;
  wall: WallSettings;
  frame: FrameSettings;
  grid: GridSettings;
  mount: MountSettings;
  cells: Record<string, CellOverride>;
  cutouts: Cutout[];
  printer: PrinterSettings;
  accessories: Accessory[];
  customModels: CustomModel[];
  colors: { panel: string; frame: string };
}

export const cellKey = (c: number, r: number) => `${c},${r}`;
export const parseCellKey = (k: string): CellRef => {
  const [c, r] = k.split(',').map(Number);
  return { c, r };
};
