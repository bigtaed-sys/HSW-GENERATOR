// Placement of panel connectors: groups of 1–4 inserts in neighbouring cells,
// bridged on top and screwed to the wall through one of them. A group that
// spans cells of different panels holds those panels together.

import { cellKey } from '../model/types';
import { PITCH_Y } from './constants';
import type { Vec2 } from './lattice';
import type { LayoutCell, LayoutConnector, LayoutPiece } from './layoutTypes';

const near = (a: LayoutCell, b: LayoutCell) => Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - PITCH_Y) < 0.5;

/** Canonical shape of a group: offsets from the screw cell, rotated by k·60° to a unique form. */
export function canonicalGroup(cells: Vec2[], screw: number): { offsets: Vec2[]; rot: number } {
  const o = cells.map(([x, y]) => [x - cells[screw][0], y - cells[screw][1]] as Vec2);
  let best: { key: string; offsets: Vec2[]; rot: number } | null = null;
  for (let k = 0; k < 6; k++) {
    const a = (-k * Math.PI) / 3;
    const r = o
      .map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as Vec2)
      .map(([x, y]) => [Math.round(x * 10) / 10 + 0, Math.round(y * 10) / 10 + 0] as Vec2)
      .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const key = JSON.stringify(r);
    if (!best || key < best.key) best = { key, offsets: r, rot: k * 60 };
  }
  // Keep the screw cell (the origin) first.
  const offs = best!.offsets;
  const i = offs.findIndex(([x, y]) => Math.abs(x) < 0.05 && Math.abs(y) < 0.05);
  return { offsets: [offs[i], ...offs.filter((_, j) => j !== i)], rot: best!.rot };
}

/** Parameters encoding a group's canonical offsets for the shape builder. */
export function connectorParams(offsets: Vec2[]): Record<string, number> {
  const p: Record<string, number> = { n: offsets.length };
  offsets.forEach(([x, y], i) => {
    p[`x${i}`] = x;
    p[`y${i}`] = y;
  });
  return p;
}

export function connectorOffsets(p: Record<string, number>): Vec2[] {
  return Array.from({ length: p.n ?? 1 }, (_, i) => [p[`x${i}`] ?? 0, p[`y${i}`] ?? 0] as Vec2);
}

export interface ConnectorOptions {
  /** 4- or 3-cell connectors where three or more panels meet. */
  junctions: boolean;
  /** 2-cell connectors along seams, where screws are further apart than `seamSpacing`. */
  seams: boolean;
  seamSpacing: number;
  /** Single mounts along the outer edge, symmetric about the wall centre. */
  edges: boolean;
  edgeSpacing: number;
  /** Single mounts added to any panel held by fewer connectors than this. */
  minPerPanel: number;
}

export function placeConnectors(
  cells: LayoutCell[],
  panels: LayoutPiece[],
  overrides: Record<string, string>,
  opt: ConnectorOptions,
): LayoutConnector[] {
  const spacing = Math.max(50, opt.seamSpacing);
  const usable = cells.filter((c) => c.kind === 'hole' && c.panel && overrides[cellKey(c.c, c.r)] !== 'open');
  const byKey = new Map(usable.map((c) => [cellKey(c.c, c.r), c]));
  const neighbours = (a: LayoutCell) => {
    const out: LayoutCell[] = [];
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const b = byKey.get(cellKey(a.c + dc, a.r + dr));
        if (b && near(a, b)) out.push(b);
      }
    return out;
  };
  const used = new Set<string>();
  const free = (c: LayoutCell) => !used.has(cellKey(c.c, c.r));
  const groups: LayoutConnector[] = [];
  const screwPoints: { p: Vec2; panels: Set<string> }[] = [];

  const add = (gc: LayoutCell[], screw: number) => {
    gc.forEach((c) => used.add(cellKey(c.c, c.r)));
    const { offsets, rot } = canonicalGroup(gc.map((c) => [c.x, c.y] as Vec2), screw);
    const s = gc[screw];
    const panelsOf = new Set(gc.map((c) => c.panel));
    groups.push({
      id: `k${groups.length}`,
      cells: gc.map((c) => ({ c: c.c, r: c.r })),
      screw: [s.x, s.y],
      rot,
      params: connectorParams(offsets),
      panels: [...panelsOf],
    });
    screwPoints.push({ p: [s.x, s.y], panels: panelsOf });
  };
  const centroidIndex = (gc: LayoutCell[]) => {
    const cx = gc.reduce((a, c) => a + c.x, 0) / gc.length,
      cy = gc.reduce((a, c) => a + c.y, 0) / gc.length;
    let bi = 0;
    gc.forEach((c, i) => {
      if (Math.hypot(c.x - cx, c.y - cy) < Math.hypot(gc[bi].x - cx, gc[bi].y - cy) - 1e-6) bi = i;
    });
    return bi;
  };

  // Forced single mounts.
  for (const c of usable) if (overrides[cellKey(c.c, c.r)] === 'mount') add([c], 0);

  // 1. Junctions where three or more panels meet: rhombi of four cells, then triangles.
  const tris: LayoutCell[][] = [];
  const quads: LayoutCell[][] = [];
  for (const a of usable) {
    const na = neighbours(a);
    for (let i = 0; i < na.length; i++)
      for (let j = i + 1; j < na.length; j++) {
        const b = na[i],
          c = na[j];
        if (!near(b, c)) continue;
        tris.push([a, b, c]);
        // Fourth cell on the far side of b–c.
        for (const d of neighbours(b)) if (d !== a && d !== c && near(d, c)) quads.push([a, b, c, d]);
      }
  }
  const panelCount = (g: LayoutCell[]) => new Set(g.map((c) => c.panel)).size;
  const junctionCands = [...quads, ...tris]
    .filter((g) => panelCount(g) >= 3)
    .sort((g, h) => panelCount(h) - panelCount(g) || h.length - g.length);
  for (const g of opt.junctions ? junctionCands : []) {
    if (!g.every(free)) continue;
    const cx = g.reduce((a, c) => a + c.x, 0) / g.length,
      cy = g.reduce((a, c) => a + c.y, 0) / g.length;
    if (screwPoints.some((sp) => Math.hypot(sp.p[0] - cx, sp.p[1] - cy) < 45)) continue;
    add(g, centroidIndex(g));
  }

  // 2. Pairs along seams, only where the gap between screws that already hold
  // both panels (junction groups, other pairs) is longer than `spacing`.
  const seams = new Map<string, LayoutCell[][]>();
  for (const a of usable)
    for (const b of neighbours(a)) {
      if (a.panel >= b.panel) continue;
      const k = `${a.panel}|${b.panel}`;
      seams.set(k, [...(seams.get(k) ?? []), [a, b]]);
    }
  for (const [k, pairs] of opt.seams ? seams : new Map<string, LayoutCell[][]>()) {
    // Panels that only touch at a corner are tied by the junction group there.
    if (pairs.length < 3) continue;
    const [pa, pb] = k.split('|');
    const mids = pairs.map(([a, b]) => [(a.x + b.x) / 2, (a.y + b.y) / 2] as Vec2);
    const xs = mids.map((m) => m[0]),
      ys = mids.map((m) => m[1]);
    const horizontal = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    const along = (p: Vec2) => (horizontal ? p[0] : p[1]);
    const across = (p: Vec2) => (horizontal ? p[1] : p[0]);
    const t = mids.map(along);
    const t0 = Math.min(...t),
      t1 = Math.max(...t);
    const line = mids.reduce((acc, m) => acc + across(m), 0) / mids.length;
    // Screws already holding both panels near this seam.
    const holding = () =>
      screwPoints
        .filter((sp) => sp.panels.has(pa) && sp.panels.has(pb) && Math.abs(across(sp.p) - line) < 40)
        .map((sp) => along(sp.p))
        .sort((x, y) => x - y);
    // Seam ends at the wall edge are held by the frame (or single mounts), so gaps run end to end.
    const marks = [t0, ...holding(), t1].sort((x, y) => x - y);
    for (let g = 0; g + 1 < marks.length; g++) {
      const gap = marks[g + 1] - marks[g];
      const n = Math.floor(gap / spacing - 0.25);
      for (let i = 1; i <= n; i++) {
        const target = marks[g] + (gap * i) / (n + 1);
        let best = -1;
        for (let j = 0; j < pairs.length; j++) {
          if (!pairs[j].every(free)) continue;
          if (best < 0 || Math.abs(t[j] - target) < Math.abs(t[best] - target)) best = j;
        }
        if (best >= 0 && Math.abs(t[best] - target) < spacing * 0.4) {
          const [a, b] = pairs[best];
          add([a, b], a.panel < b.panel ? 0 : 1);
        }
      }
    }
  }

  const nearestFree = (pt: Vec2, maxDist: number, pool = usable) => {
    let best: LayoutCell | null = null;
    let bd = Infinity;
    for (const c of pool) {
      if (!free(c)) continue;
      // Ties go to the cell closer to the wall centre line, which keeps mirrored picks mirrored.
      const d = Math.hypot(c.x - pt[0], c.y - pt[1]) + 1e-6 * (Math.abs(c.x) + Math.abs(c.y));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best && bd <= maxDist ? best : null;
  };

  // 3. Single mounts along the outer edge, placed in mirrored sets so the result is symmetric.
  if (opt.edges && usable.length) {
    const xs = usable.map((c) => c.x),
      ys = usable.map((c) => c.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    const step = Math.max(60, opt.edgeSpacing);
    const along = (a: number, b: number) => {
      const n = Math.max(1, Math.round((b - a) / step));
      return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
    };
    const targets: Vec2[] = [
      ...along(y0, y1).flatMap((y) => [[x0, y] as Vec2, [x1, y] as Vec2]),
      ...along(x0, x1).flatMap((x) => [[x, y0] as Vec2, [x, y1] as Vec2]),
    ];
    const done = new Set<string>();
    const reach = step * 0.5;
    for (const tg of targets) {
      const set: Vec2[] = [tg, [2 * cx - tg[0], tg[1]], [tg[0], 2 * cy - tg[1]], [2 * cx - tg[0], 2 * cy - tg[1]]];
      const keys = set.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`);
      if (keys.some((k) => done.has(k))) continue;
      keys.forEach((k) => done.add(k));
      const unique = set.filter((_, i) => keys.indexOf(keys[i]) === i);
      const needs = unique.some((p) => !screwPoints.some((sp) => Math.hypot(sp.p[0] - p[0], sp.p[1] - p[1]) < reach));
      if (!needs) continue;
      for (const p of unique) {
        if (screwPoints.some((sp) => Math.hypot(sp.p[0] - p[0], sp.p[1] - p[1]) < reach * 0.6)) continue;
        const c = nearestFree(p, PITCH_Y * 1.5);
        if (c) add([c], 0);
      }
    }
  }

  // 4. Safety net: panels held by fewer connectors than required get singles,
  // first near the middle, then as far as possible from the existing ones.
  for (const p of panels) {
    const own = usable.filter((c) => c.panel === p.id);
    for (;;) {
      const pts = screwPoints.filter((sp) => sp.panels.has(p.id)).map((sp) => sp.p);
      if (pts.length >= opt.minPerPanel) break;
      const [x0, y0, x1, y1] = p.bbox;
      const dist = (c: LayoutCell) => Math.min(...pts.map((q) => Math.hypot(q[0] - c.x, q[1] - c.y)));
      const c = pts.length
        ? own.filter(free).reduce<LayoutCell | null>((best, x) => (!best || dist(x) > dist(best) ? x : best), null)
        : nearestFree([(x0 + x1) / 2, (y0 + y1) / 2], Infinity, own);
      if (!c) break;
      add([c], 0);
    }
  }
  return groups;
}

