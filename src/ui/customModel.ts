import { parseStl } from '../export/stl';
import type { Vec2 } from '../geometry/lattice';
import type { CustomModel } from '../model/types';

const rawCache = new Map<string, Float32Array>();

function raw(m: CustomModel): Float32Array {
  let r = rawCache.get(m.id);
  if (!r) {
    const bin = atob(m.stl);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    r = parseStl(bytes.buffer);
    rawCache.set(m.id, r);
  }
  return r;
}

const prepared = new Map<string, { positions: Float32Array; hull: Vec2[] }>();

/**
 * Model triangles rotated by quarter turns, centred in XY on its bounding box and
 * resting on z = 0 (the wall front), plus the convex hull of its front view.
 */
export function preparedModel(m: CustomModel) {
  const key = `${m.id}|${m.rot.join(',')}`;
  const hit = prepared.get(key);
  if (hit) return hit;
  const src = raw(m);
  const p = new Float32Array(src.length);
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < src.length; i += 3) {
    let x = src[i],
      y = src[i + 1],
      z = src[i + 2];
    for (let k = 0; k < m.rot[0]; k++) [y, z] = [-z, y];
    for (let k = 0; k < m.rot[1]; k++) [x, z] = [z, -x];
    for (let k = 0; k < m.rot[2]; k++) [x, y] = [-y, x];
    p[i] = x;
    p[i + 1] = y;
    p[i + 2] = z;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    z0 = Math.min(z0, z);
  }
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const pts: Vec2[] = [];
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= cx;
    p[i + 1] -= cy;
    p[i + 2] -= z0;
    if (i % 9 === 0 || p.length < 30000) pts.push([p[i], p[i + 1]]);
  }
  const res = { positions: p, hull: convexHull(pts) };
  prepared.set(key, res);
  return res;
}

function convexHull(points: Vec2[]): Vec2[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
