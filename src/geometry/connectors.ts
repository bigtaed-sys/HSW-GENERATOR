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

export function placeConnectors(
  cells: LayoutCell[],
  panels: LayoutPiece[],
  overrides: Record<string, string>,
  spacing: number,
): LayoutConnector[] {
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
  for (const g of junctionCands) {
    if (!g.every(free)) continue;
    const cx = g.reduce((a, c) => a + c.x, 0) / g.length,
      cy = g.reduce((a, c) => a + c.y, 0) / g.length;
    if (screwPoints.some((sp) => Math.hypot(sp.p[0] - cx, sp.p[1] - cy) < spacing * 0.5)) continue;
    add(g, centroidIndex(g));
  }

  // 2. Pairs along each seam between two panels, about `spacing` apart.
  const seams = new Map<string, LayoutCell[][]>();
  for (const a of usable)
    for (const b of neighbours(a)) {
      if (a.panel >= b.panel) continue;
      const k = `${a.panel}|${b.panel}`;
      seams.set(k, [...(seams.get(k) ?? []), [a, b]]);
    }
  for (const [k, pairs] of seams) {
    const [pa, pb] = k.split('|');
    const mids = pairs.map(([a, b]) => [(a.x + b.x) / 2, (a.y + b.y) / 2] as Vec2);
    const xs = mids.map((m) => m[0]),
      ys = mids.map((m) => m[1]);
    const horizontal = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    const t = mids.map((m) => (horizontal ? m[0] : m[1]));
    const t0 = Math.min(...t),
      t1 = Math.max(...t);
    const n = Math.max(1, Math.round((t1 - t0) / spacing));
    for (let i = 0; i < n; i++) {
      const target = t0 + ((i + 0.5) * (t1 - t0)) / n;
      let best = -1;
      for (let j = 0; j < pairs.length; j++) {
        if (!pairs[j].every(free)) continue;
        const m = mids[j];
        const tooClose = screwPoints.some(
          (sp) => (sp.panels.has(pa) || sp.panels.has(pb)) && Math.hypot(sp.p[0] - m[0], sp.p[1] - m[1]) < spacing * 0.6,
        );
        if (tooClose) continue;
        if (best < 0 || Math.abs(t[j] - target) < Math.abs(t[best] - target)) best = j;
      }
      if (best >= 0 && Math.abs(t[best] - target) < spacing * 0.5) {
        const [a, b] = pairs[best];
        add([a, b], a.panel < b.panel ? 0 : 1);
      }
    }
  }

  // 3. Single mounts wherever a panel area is still far from any screw.
  for (const p of panels) {
    const [x0, y0, x1, y1] = p.bbox;
    const ix = (x1 - x0) * 0.22,
      iy = (y1 - y0) * 0.22;
    const targets: Vec2[] = [
      [(x0 + x1) / 2, (y0 + y1) / 2],
      [x0 + ix, y1 - iy],
      [x1 - ix, y1 - iy],
      [x0 + ix, y0 + iy],
      [x1 - ix, y0 + iy],
    ];
    const own = usable.filter((c) => c.panel === p.id);
    const hasNear = (pt: Vec2, r: number) => screwPoints.some((sp) => sp.panels.has(p.id) && Math.hypot(sp.p[0] - pt[0], sp.p[1] - pt[1]) < r);
    for (const tg of targets) {
      if (hasNear(tg, spacing * 0.9)) continue;
      let best: LayoutCell | null = null;
      for (const c of own) if (free(c) && (!best || Math.hypot(c.x - tg[0], c.y - tg[1]) < Math.hypot(best.x - tg[0], best.y - tg[1]))) best = c;
      if (best) add([best], 0);
    }
    // Every panel gets at least two screws.
    const count = () => screwPoints.filter((sp) => sp.panels.has(p.id)).length;
    while (count() < 2) {
      const far = own.filter(free).sort((a, b) => {
        const d = (c: LayoutCell) => Math.min(...screwPoints.filter((sp) => sp.panels.has(p.id)).map((sp) => Math.hypot(sp.p[0] - c.x, sp.p[1] - c.y)), 1e9);
        return d(b) - d(a);
      });
      if (!far.length) break;
      add([far[0]], 0);
    }
  }
  return groups;
}

