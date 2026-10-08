// Honeycomb Storage Wall (HSW) reference geometry, as used by the original
// design by RostaP and the community OpenSCAD generators that match it.

/** Hole width, flat to flat. */
export const HOLE = 20;
/** Wall thickness on each side of a hole (a shared wall is 2x this). */
export const WALL = 1.8;
/** Panel depth. */
export const DEPTH = 8;
/** Lattice pitch between cells in the same column (flat-to-flat of a tile). */
export const PITCH_Y = HOLE + 2 * WALL; // 23.6
/** Tile circumradius (centre to vertex). */
export const TILE_R = PITCH_Y / Math.sqrt(3);
/** Horizontal distance between neighbouring columns. */
export const PITCH_X = 1.5 * TILE_R;

/**
 * Hole profile as [z, flat-to-flat width] pairs from the back (z=0) to the front.
 * The back has a small elephant-foot chamfer; the front has a wider recess
 * that the insert lips and snaps rely on.
 */
export const HOLE_PROFILE: [number, number][] = [
  [0, 20.8],
  [0.5, 20],
  [5.1, 20],
  [6, 22],
  [DEPTH, 22],
];
/** Front opening width. */
export const HOLE_FRONT = 22;

/** Insert geometry for generated accessories. */
export const INSERT = {
  body: 19.7,
  lip: 22.5,
  lipHeight: 2.5,
  length: 10,
  bore: 13.4,
  snap: 0.45,
};
