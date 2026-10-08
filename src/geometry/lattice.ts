import type { GridSettings } from '../model/types';
import { PITCH_X, PITCH_Y, TILE_R } from './constants';

export type Vec2 = [number, number];

const isOdd = (n: number) => ((n % 2) + 2) % 2 === 1;

/** Whether a column is shifted half a cell upwards. */
export const columnShifted = (c: number, grid: Pick<GridSettings, 'flipStagger'>) =>
  isOdd(c) !== grid.flipStagger;

export function cellCenter(c: number, r: number, grid: GridSettings): Vec2 {
  const half = columnShifted(c, grid) ? 0.5 : 0;
  return [c * PITCH_X + grid.offsetX, (r + half) * PITCH_Y + grid.offsetY];
}

/** Lattice cell nearest to a point. */
export function cellAt(x: number, y: number, grid: GridSettings): { c: number; r: number } {
  const c0 = Math.round((x - grid.offsetX) / PITCH_X);
  let best = { c: c0, r: 0 };
  let bestD = Infinity;
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    const half = columnShifted(c, grid) ? 0.5 : 0;
    const r = Math.round((y - grid.offsetY) / PITCH_Y - half);
    const [cx, cy] = cellCenter(c, r, grid);
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { c, r };
    }
  }
  return best;
}

/** Regular hexagon with vertices pointing left/right (flat top and bottom). */
export function hexagon(flat: number, cx = 0, cy = 0): Vec2[] {
  const R = flat / Math.sqrt(3);
  const pts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return pts;
}

export const tile = (cx: number, cy: number) => hexagon(PITCH_Y, cx, cy);

/** Inclusive lattice index range whose tiles may touch the given box. */
export function latticeRange(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  grid: GridSettings,
) {
  return {
    c0: Math.floor((minX - grid.offsetX - TILE_R) / PITCH_X) - 1,
    c1: Math.ceil((maxX - grid.offsetX + TILE_R) / PITCH_X) + 1,
    r0: Math.floor((minY - grid.offsetY) / PITCH_Y) - 2,
    r1: Math.ceil((maxY - grid.offsetY) / PITCH_Y) + 2,
  };
}
