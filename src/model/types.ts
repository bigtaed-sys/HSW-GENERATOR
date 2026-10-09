// All dimensions are in millimetres. The wall lives in the XY plane with the
// origin at the wall centre, +Y up and +Z pointing out of the wall (towards the viewer).

export type Lang = 'ru' | 'en';

export type WallShape = 'rect' | 'hexagon' | 'ellipse' | 'honeycomb' | 'custom';
export type CellMode = 'whole' | 'partial';
export type CellOverride = 'solid' | 'mount' | 'open';

export interface WallSettings {
  shape: WallShape;
  width: number;
  height: number;
  cornerRadius: number;
  /** Outline for the custom shape, in mm around the wall centre. */
  points: [number, number][];
}

export type FrameJoint = 'none' | 'lap';

export type FrameMode = 'separate' | 'integrated';

export interface FrameSettings {
  width: number; // 0 = no frame
  /** separate: printed as its own parts; integrated: each edge panel carries its share of the frame. */
  mode: FrameMode;
  /** Frame style id from the style registry (geometry/frames/styles.ts). */
  style: string;
  /** Parameters of the selected style. Kept per style so switching back restores them. */
  styleParams: Record<string, Record<string, number>>;
  proud: number; // how far the frame front stands out over the grid front
  /** How far the frame front overlaps the panel edges (needs `proud`). */
  lip: number;
  /** Size of the inner edge finish (chamfer or radius). */
  innerChamfer: number;
  /** How the inner edge of the frame meets the cells: a straight chamfer or a round. */
  innerProfile: InnerProfile;
  /** Decorative relief on the frame front. */
  pattern: PatternSettings;
  screws: boolean;
  joint: FrameJoint;
  jointLength: number;
  led: LedSettings;
}

export type InnerProfile = 'chamfer' | 'round';

/** hex: small decorative pockets; lit: grooves along the wall's honeycomb with a thin floor over a hollow back, for LEDs to shine through. */
export type PatternMode = 'none' | 'hex' | 'lit';

export interface PatternSettings {
  mode: PatternMode;
  /** Distance between pocket centres. */
  size: number;
  /** Width of the ribs between pockets. */
  rib: number;
  depth: number;
  /** Plain border kept along the outer and inner edges of the frame (lit: the walls around the hollow). */
  margin: number;
  /** lit: thickness of the front plate over the hollow. */
  plate: number;
  /** lit: plastic left at the bottom of the grooves; light passes through it. */
  skin: number;
}

export type LedMode = 'none' | 'front' | 'halo';

export interface LedSettings {
  /** front: groove for a strip in the frame front; halo: rebate at the back outer edge for wall glow. */
  mode: LedMode;
  width: number;
  depth: number;
  /** Hole for the cable at the bottom of the frame. */
  wire: boolean;
}

export interface GridSettings {
  mode: CellMode;
  minEdge: number; // minimum solid material between a cell and an edge
  minPartial: number; // 0..1, smallest kept fraction of a clipped cell
  offsetX: number;
  offsetY: number;
  flipStagger: boolean;
}

export type MountMode = 'connectors' | 'cells';

export interface MountSettings {
  /** connectors: snap-in connector groups across panel seams, one screw each; cells: screw floors inside cells. */
  mode: MountMode;
  /** 4-/3-cell connectors where panels meet. */
  junctions: boolean;
  /** 2-cell connectors along seams. */
  seams: boolean;
  /** Target distance between connectors along a seam (mm). */
  spacing: number;
  /** Single mounts along the outer edge. */
  edges: boolean;
  edgeSpacing: number;
  /** Minimum connectors holding each panel. */
  minPerPanel: number;
  perPanel: number; // automatically placed screw cells per panel (cells mode)
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
  /** Added to the hole width (mm). Positive = looser inserts. */
  holeTolerance: number;
  /** Added to the generated insert body width (mm). Positive = tighter fit. */
  insertTolerance: number;
  /** Engrave piece labels (screw-cell floors of panels, back of frame parts). */
  engrave: boolean;
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
  colors: { panel: string; frame: string; connector: string };
}

export const cellKey = (c: number, r: number) => `${c},${r}`;
export const parseCellKey = (k: string): CellRef => {
  const [c, r] = k.split(',').map(Number);
  return { c, r };
};
