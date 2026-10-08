import type {
  CrossSection as CS,
  Manifold as MF,
  ManifoldToplevel,
} from 'manifold-3d';
import type { Vec2 } from './lattice';

export type Kernel = ManifoldToplevel;
export type CrossSection = CS;
export type Manifold = MF;

/**
 * Manifold objects live in WASM memory and must be freed explicitly.
 * Everything created while computing a result goes through a Scope that is
 * released once the plain-JS result has been extracted.
 */
export class Scope {
  private items: { delete(): void }[] = [];
  t<T extends { delete(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  free() {
    for (const x of this.items) {
      try {
        x.delete();
      } catch {
        // already freed
      }
    }
    this.items = [];
  }
}

export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export const ccw = (pts: Vec2[]) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

export function polysOf(cs: CrossSection): Vec2[][] {
  return cs.toPolygons().map((p) => p.map((v) => [v[0], v[1]] as Vec2));
}

export function bboxOf(polys: Vec2[][]): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
}

export function pointInPolys(x: number, y: number, polys: Vec2[][]): boolean {
  // Even-odd over all contours handles holes.
  let inside = false;
  for (const p of polys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Smallest rotation (in 3° steps) that fits the outline into a bed.
 * Returns the angle and the rotated size, or null angle when it never fits.
 */
export function fitOnBed(
  polys: Vec2[][],
  bedW: number,
  bedH: number,
): { angle: number | null; size: [number, number] } {
  const pts = polys.flat();
  let best: { angle: number | null; size: [number, number] } = { angle: null, size: [0, 0] };
  let bestArea = Infinity;
  for (let a = 0; a < 180; a += 3) {
    const r = (a * Math.PI) / 180;
    const c = Math.cos(r),
      s = Math.sin(r);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const [x, y] of pts) {
      const u = x * c - y * s,
        v = x * s + y * c;
      if (u < x0) x0 = u;
      if (u > x1) x1 = u;
      if (v < y0) y0 = v;
      if (v > y1) y1 = v;
    }
    const w = x1 - x0,
      h = y1 - y0;
    if (a === 0) best = { angle: null, size: [w, h] };
    if (w <= bedW + 1e-6 && h <= bedH + 1e-6) return { angle: a, size: [w, h] };
    if (w * h < bestArea) {
      bestArea = w * h;
      best = { angle: null, size: [w, h] };
    }
  }
  return best;
}
