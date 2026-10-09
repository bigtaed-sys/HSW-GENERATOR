import type { Vec2 } from './lattice';

export type CellKind = 'hole' | 'partial' | 'mount' | 'solid' | 'conn';

export interface LayoutCell {
  c: number;
  r: number;
  x: number;
  y: number;
  kind: CellKind;
  panel: string;
  /** Clipped front opening, only for partial cells. */
  poly?: Vec2[][];
}

export interface LayoutPiece {
  id: string;
  kind: 'panel' | 'frame';
  label: string;
  polys: Vec2[][];
  bbox: [number, number, number, number];
  /** Rotation (degrees) that makes the piece fit the bed, or null when it does not fit. */
  printAngle: number | null;
  printSize: [number, number];
  holes: number;
  /** Rough material volume in cm³. */
  volume: number;
  screws: Vec2[];
  /** Where to draw the label. */
  anchor: Vec2;
  /** Direction of the label text in degrees. */
  anchorAngle: number;
  /** Assembly stage: 0 panels, 1 frame parts that go underneath at joints, 2 frame parts on top. */
  stage: number;
  /** Integrated frame: the frame part of an edge panel. */
  framePolys?: Vec2[][];
  frameAnchor?: Vec2;
  frameAnchorAngle?: number;
}

/** A connector group: inserts in neighbouring cells, bridged on top, one screw. */
export interface LayoutConnector {
  id: string;
  cells: { c: number; r: number }[];
  /** Centre of the screw cell. */
  screw: Vec2;
  /** Rotation (degrees) from the canonical shape (screw cell at the origin) to the wall. */
  rot: number;
  /** Shape parameters (canonical offsets) for the geometry builder. */
  params: Record<string, number>;
  panels: string[];
}

/** Where the LED strip goes and how it lights the frame, for the lighting preview. */
export interface LayoutLed {
  /** inside: on the inner face of the outer wall of a Backlit cells hollow; front: in the front groove; halo: in the back rebate. */
  kind: 'inside' | 'front' | 'halo';
  /** Strip centre line, closed, counter-clockwise. */
  path: Vec2[];
  /** inside: the strip stands from z0 to z1; front/halo: it lies flat at z0, `width` wide. */
  z0: number;
  z1: number;
  width: number;
  /** Strip length in mm. */
  length: number;
  /** Where the cable leaves the frame. */
  wire: Vec2 | null;
  /** Backlit cells: the groove floors, with each vertex's distance to the strip. */
  glow?: { positions: Float32Array; indices: Uint32Array; dist: Float32Array };
}

export interface Layout {
  outer: Vec2[][];
  inner: Vec2[][];
  /** Pockets of the decorative frame pattern. */
  pattern?: Vec2[][];
  /** Backlit cells: thin patches glued behind the seams between frame parts. */
  plates?: { id: string; label: string; polys: Vec2[][] }[];
  led?: LayoutLed;
  cells: LayoutCell[];
  pieces: LayoutPiece[];
  connectors: LayoutConnector[];
  warnings: string[];
  stats: {
    holes: number;
    partial: number;
    mounts: number;
    connectors: number;
    panels: number;
    framePieces: number;
    volume: number;
    width: number;
    height: number;
  };
}

export interface MeshData {
  id: string;
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
}

export interface AccessoryShape {
  key: string;
  mesh: MeshData;
  outline: Vec2[][];
  /** Side view (x = distance from wall, y = up). */
  side: Vec2[][];
  pegs: Vec2[];
}
