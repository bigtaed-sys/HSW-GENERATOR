import type { Cutout, Project } from '../model/types';
import { cellKey } from '../model/types';
import { DEPTH, HOLE_FRONT, HOLE_PROFILE, PITCH_X, PITCH_Y, TILE_R } from './constants';
import {
  bboxOf,
  ccw,
  fitOnBed,
  pointInPolys,
  polysOf,
  Scope,
  signedArea,
  type CrossSection,
  type Kernel,
} from './kernel';
import { cellCenter, hexagon, latticeRange, tile, type Vec2 } from './lattice';
import { placeConnectors } from './connectors';
import type { Layout, LayoutCell, LayoutPiece } from './layoutTypes';

const hexArea = (flat: number) => (Math.sqrt(3) / 2) * flat * flat;

/** Volume of one hole (mm³), integrated over its profile. */
export const HOLE_VOLUME = (() => {
  let v = 0;
  for (let i = 0; i + 1 < HOLE_PROFILE.length; i++) {
    const [z0, w0] = HOLE_PROFILE[i];
    const [z1, w1] = HOLE_PROFILE[i + 1];
    const a0 = hexArea(w0),
      a1 = hexArea(w1);
    v += ((z1 - z0) * (a0 + a1 + Math.sqrt(a0 * a1))) / 3;
  }
  return v;
})();

export interface LayoutInternal {
  project: Project;
  layout: Layout;
  scope: Scope;
  outer: CrossSection;
  inner: CrossSection;
  gridRegion: CrossSection;
  allowed: CrossSection;
  hasFrame: boolean;
  frontZ: number;
  cuts: Cutout[];
  regions: Map<string, CrossSection>;
  /** Inner edge of the frame lip (equals `inner` without a lip). */
  lipInner: CrossSection;
  lip: number;
  frameParts: Map<string, FrameParts>;
}

/** A frame piece: full-height core plus half-height lap ends lying on top of (high) or under (low) its neighbours. */
export interface FrameParts {
  core: CrossSection;
  high: CrossSection[];
  low: CrossSection[];
}

function shapePolygon(project: Project): Vec2[] {
  const { shape, width: w, height: h } = project.wall;
  if (shape === 'hexagon') {
    const q = Math.min(h / (2 * Math.sqrt(3)), w / 2 - 1);
    return [
      [w / 2, 0],
      [w / 2 - q, h / 2],
      [-w / 2 + q, h / 2],
      [-w / 2, 0],
      [-w / 2 + q, -h / 2],
      [w / 2 - q, -h / 2],
    ];
  }
  if (shape === 'ellipse') {
    const n = 128;
    return Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return [(w / 2) * Math.cos(a), (h / 2) * Math.sin(a)] as Vec2;
    });
  }
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
}

export function roundedRect(
  K: Kernel,
  s: Scope,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): CrossSection {
  const rr = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  let cs = s.t(K.CrossSection.square([w, h], true));
  if (rr > 0.05) cs = s.t(s.t(cs.offset(-rr, 'Miter')).offset(rr, 'Round', 2, 48));
  return s.t(cs.translate([x, y]));
}

export function computeLayout(K: Kernel, project: Project): LayoutInternal {
  const s = new Scope();
  const { wall, frame, grid, printer, mount } = project;
  const CS = K.CrossSection;
  const warnings: string[] = [];

  // ---- Outline -------------------------------------------------------------
  let outer: CrossSection;
  const honeycomb = wall.shape === 'honeycomb';
  if (honeycomb) {
    const rg = latticeRange(-wall.width / 2, -wall.height / 2, wall.width / 2, wall.height / 2, grid);
    const tiles: Vec2[][] = [];
    for (let c = rg.c0; c <= rg.c1; c++)
      for (let r = rg.r0; r <= rg.r1; r++) {
        const [x, y] = cellCenter(c, r, grid);
        if (Math.abs(x) <= wall.width / 2 && Math.abs(y) <= wall.height / 2) tiles.push(tile(x, y));
      }
    // Slightly grow and shrink so neighbouring tiles fuse into one region.
    outer = s.t(s.t(s.t(new CS(tiles, 'Positive')).offset(0.01, 'Miter')).offset(-0.01, 'Miter'));
  } else {
    outer = s.t(new CS([ccw(shapePolygon(project))]));
    const r = Math.min(wall.cornerRadius, Math.min(wall.width, wall.height) / 2 - 1);
    if (r > 0.05) outer = s.t(s.t(outer.offset(-r, 'Miter')).offset(r, 'Round', 2, 96));
  }

  const hasFrame = !honeycomb && frame.width > 0.01;
  const inner = hasFrame ? s.t(outer.offset(-frame.width, 'Round', 2, 96)) : outer;
  // The lip is the part of the frame front that reaches over the panel edges.
  const lip = hasFrame && frame.proud >= 1 ? Math.max(0, frame.lip) : 0;
  const lipInner = lip > 0 ? s.t(inner.offset(-lip, 'Round', 2, 96)) : inner;
  if (hasFrame && inner.isEmpty()) warnings.push('warnFrameTooWide');

  const cuts = project.cutouts;
  const cutCS = cuts.map((c) => roundedRect(K, s, c.x, c.y, c.w, c.h, c.r));
  const rimCS = cuts.map((c, i) => (c.rim > 0 ? s.t(cutCS[i].offset(c.rim, 'Round', 2, 48)) : cutCS[i]));
  const allCuts = cutCS.length ? s.t(CS.union(cutCS)) : s.t(new CS([[]]));
  const allRims = rimCS.length ? s.t(CS.union(rimCS)) : s.t(new CS([[]]));

  const gridRegion = s.t(inner.subtract(allCuts));
  const allowedBase = honeycomb ? inner : s.t(inner.offset(-Math.max(grid.minEdge, lip > 0 ? lip + 1 : 0), 'Round', 2, 48));
  const allowed = s.t(allowedBase.subtract(allRims));

  // ---- Cells ---------------------------------------------------------------
  const b = gridRegion.bounds();
  const rg = latticeRange(b.min[0], b.min[1], b.max[0], b.max[1], grid);
  const frontArea = hexArea(HOLE_FRONT);
  const cells: LayoutCell[] = [];
  const quickBox = allowed.bounds();
  for (let c = rg.c0; c <= rg.c1; c++) {
    for (let r = rg.r0; r <= rg.r1; r++) {
      const [x, y] = cellCenter(c, r, grid);
      if (x + TILE_R < b.min[0] || x - TILE_R > b.max[0] || y + PITCH_Y / 2 < b.min[1] || y - PITCH_Y / 2 > b.max[1])
        continue;
      const key = cellKey(c, r);
      const ov = project.cells[key];
      let aIn = 0;
      let clip: CrossSection | null = null;
      if (
        !(x + TILE_R < quickBox.min[0] || x - TILE_R > quickBox.max[0] || y + PITCH_Y < quickBox.min[1] || y - PITCH_Y > quickBox.max[1])
      ) {
        const f = s.t(new CS([hexagon(HOLE_FRONT, x, y)]));
        clip = s.t(f.intersect(allowed));
        aIn = clip.area();
      }
      if (ov === 'solid') {
        const t = s.t(new CS([tile(x, y)]));
        if (s.t(t.intersect(gridRegion)).area() > 1) cells.push({ c, r, x, y, kind: 'solid', panel: '' });
        continue;
      }
      if (aIn >= frontArea * 0.9999) {
        cells.push({ c, r, x, y, kind: 'hole', panel: '' });
      } else if (grid.mode === 'partial' && clip && aIn / frontArea >= grid.minPartial && aIn > 20) {
        cells.push({ c, r, x, y, kind: 'partial', panel: '', poly: polysOf(clip) });
      }
    }
  }

  // ---- Panels --------------------------------------------------------------
  const usableW = printer.bedW - 2 * printer.margin;
  const usableH = printer.bedH - 2 * printer.margin;
  const kMax = Math.floor((usableW / TILE_R - 0.5) / 1.5);
  const nMax = Math.floor((usableH - PITCH_Y / 2) / PITCH_Y);
  const regions = new Map<string, CrossSection>();
  const pieces: LayoutPiece[] = [];

  if (kMax < 1 || nMax < 1) {
    warnings.push('warnBedTooSmall');
  } else if (!gridRegion.isEmpty()) {
    // Columns / rows that actually carry material.
    const usedCols: number[] = [];
    for (let c = rg.c0; c <= rg.c1; c++) {
      const x = c * PITCH_X + grid.offsetX;
      const strip = s.t(CS.square([2 * TILE_R, b.max[1] - b.min[1] + 2], true)).translate([x, (b.min[1] + b.max[1]) / 2]);
      s.t(strip);
      if (s.t(strip.intersect(gridRegion)).area() > 1) usedCols.push(c);
    }
    const usedRows: number[] = [];
    for (let r = rg.r0; r <= rg.r1; r++) {
      const y0 = (r - 0.5) * PITCH_Y + grid.offsetY;
      const band = s.t(s.t(CS.square([b.max[0] - b.min[0] + 2, 1.5 * PITCH_Y])).translate([b.min[0] - 1, y0]));
      if (s.t(band.intersect(gridRegion)).area() > 1) usedRows.push(r);
    }
    const colGroups = splitEven(usedCols, kMax);
    const rowGroups = splitEven(usedRows, nMax);

    const panelOf = new Map<string, string>();
    rowGroups.forEach((rows, gj) => {
      colGroups.forEach((cols, gi) => {
        const id = `p${gi}_${gj}`;
        const tiles: Vec2[][] = [];
        for (const c of cols)
          for (const r of rows) {
            const [x, y] = cellCenter(c, r, grid);
            tiles.push(tile(x, y));
            panelOf.set(cellKey(c, r), id);
          }
        const union = s.t(s.t(s.t(new CS(tiles, 'Positive')).offset(0.005, 'Miter')).offset(-0.005, 'Miter'));
        const region = s.t(union.intersect(gridRegion));
        if (region.area() < 30) return;
        regions.set(id, region);
        const polys = polysOf(region);
        const row = rowGroups.length - 1 - gj;
        pieces.push({
          id,
          kind: 'panel',
          label: `${String.fromCharCode(65 + (row % 26))}${gi + 1}`,
          polys,
          bbox: bboxOf(polys),
          printAngle: null,
          printSize: [0, 0],
          holes: 0,
          volume: 0,
          screws: [],
          anchor: centroid(polys),
          anchorAngle: 0,
          stage: 0,
        });
      });
    });
    for (const cell of cells) cell.panel = panelOf.get(cellKey(cell.c, cell.r)) ?? '';

    // Screw cells (legacy mounting mode).
    for (const piece of mount.mode === 'connectors' ? [] : pieces) {
      const own = cells.filter((c) => c.panel === piece.id && c.kind === 'hole');
      for (const c of own) if (project.cells[cellKey(c.c, c.r)] === 'mount') c.kind = 'mount';
      const free = own.filter((c) => c.kind === 'hole' && project.cells[cellKey(c.c, c.r)] !== 'open');
      for (const [tx, ty] of mountTargets(piece.bbox, mount.perPanel)) {
        let best: LayoutCell | null = null;
        let bd = Infinity;
        for (const c of free) {
          if (c.kind !== 'hole') continue;
          const d = (c.x - tx) ** 2 + (c.y - ty) ** 2;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (best) best.kind = 'mount';
      }
    }
  }

  // ---- Connectors ----------------------------------------------------------
  const connectors =
    mount.mode === 'connectors'
      ? placeConnectors(cells, pieces.filter((p) => p.kind === 'panel'), project.cells, Math.max(50, mount.spacing))
      : [];
  for (const k of connectors) Object.assign(k.params, { screw: mount.screwDiameter, head: mount.headDiameter });
  if (connectors.length) {
    const taken = new Set(connectors.flatMap((k) => k.cells.map((c) => cellKey(c.c, c.r))));
    for (const c of cells) if (taken.has(cellKey(c.c, c.r))) c.kind = 'conn';
  }

  // ---- Frame pieces --------------------------------------------------------
  const frontZ = DEPTH + (hasFrame ? frame.proud : 0);
  const frameParts = new Map<string, FrameParts>();
  if (hasFrame && !inner.isEmpty()) {
    const band = s.t(s.t(outer.subtract(lipInner)).subtract(allCuts));
    const lapLen = frame.joint === 'lap' ? Math.max(10, frame.jointLength) : 0;
    const bandW = frame.width + lip;
    const split = splitFrame(K, s, outer, band, bandW, usableW, usableH, lapLen);
    if (!split) warnings.push('warnFrameSplit');
    const mid = polysOf(s.t(outer.offset(-frame.width / 2, 'Round', 2, 96)));
    const screwOk = frame.screws && frame.width >= mount.headDiameter + 3;
    const m = split?.pieces.length ?? 0;
    const laps = lapLen && split && m > 1 ? split.cuts.map((c) => s.t(band.intersect(lapRect(K, s, c, lapLen, bandW)))) : [];
    const lapScrews: Vec2[] = laps.length && screwOk
      ? split!.cuts.map((c) => [c.p[0] - c.t[1] * (frame.width / 2), c.p[1] + c.t[0] * (frame.width / 2)] as Vec2)
      : [];
    // Lap joints alternate: even parts lie underneath at both ends, odd parts on top.
    // With an odd count the last and first part meet two "under" ends; the last one goes under.
    const under = (i: number) => i % 2 === 0;
    const parts: FrameParts[] = (split?.pieces ?? []).map((core) => ({ core, high: [], low: [] }));
    laps.forEach((lap, j) => {
      const prev = (j - 1 + m) % m,
        cur = j;
      const prevLow = under(prev) && (!under(cur) || prev === m - 1);
      parts[prevLow ? prev : cur].low.push(lap);
      parts[prevLow ? cur : prev].high.push(lap);
    });
    (split?.pieces ?? []).forEach((region, i) => {
      const id = `f${i}`;
      const pp = parts[i];
      for (const lap of [...pp.high, ...pp.low]) pp.core = s.t(pp.core.subtract(lap));
      const footprint = laps.length ? s.t(CS.union([pp.core, ...pp.high, ...pp.low])) : region;
      frameParts.set(id, pp);
      regions.set(id, footprint);
      const polys = polysOf(footprint);
      const corePolys = polysOf(region);
      const screws = screwOk
        ? [
            ...frameScrews(mid, corePolys, cuts, mount.headDiameter, lapScrews, lapLen),
            ...(laps.length ? [lapScrews[i], lapScrews[(i + 1) % m]] : []),
          ]
        : [];
      const anchor = frameAnchor(mid, corePolys);
      pieces.push({
        id,
        kind: 'frame',
        label: `F${i + 1}`,
        polys,
        bbox: bboxOf(polys),
        printAngle: null,
        printSize: [0, 0],
        holes: 0,
        volume: (footprint.area() * frontZ) / 1000,
        screws,
        anchor: anchor.p,
        anchorAngle: anchor.angle,
        stage: pp.high.length ? 2 : 1,
      });
    });
  }

  // ---- Fit & stats ---------------------------------------------------------
  const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  pieces.sort((a, b) => (a.kind === b.kind ? natural(a.label, b.label) : a.kind === 'panel' ? -1 : 1));
  let volume = 0;
  for (const p of pieces) {
    const fit = fitOnBed(p.polys, usableW, usableH);
    p.printAngle = fit.angle;
    p.printSize = fit.size;
    if (p.kind === 'panel') {
      const own = cells.filter((c) => c.panel === p.id);
      p.holes = own.filter((c) => c.kind !== 'solid').length;
      const area = p.polys.reduce((a, poly) => a + signedArea(poly), 0);
      let v = area * DEPTH;
      for (const c of own) {
        if (c.kind === 'hole' || c.kind === 'mount' || c.kind === 'conn') v -= HOLE_VOLUME;
        else if (c.kind === 'partial' && c.poly)
          v -= (HOLE_VOLUME * c.poly.reduce((a, poly) => a + signedArea(poly), 0)) / frontArea;
      }
      p.volume = Math.max(0, v) / 1000;
    }
    volume += p.volume;
    if (p.printAngle === null) warnings.push('warnPieceTooBig');
  }

  const ob = outer.bounds();
  const layout: Layout = {
    outer: polysOf(outer),
    inner: hasFrame ? polysOf(inner) : [],
    cells,
    pieces,
    connectors,
    warnings: [...new Set(warnings)],
    stats: {
      holes: cells.filter((c) => c.kind === 'hole').length,
      partial: cells.filter((c) => c.kind === 'partial').length,
      mounts: cells.filter((c) => c.kind === 'mount').length,
      connectors: connectors.length,
      panels: pieces.filter((p) => p.kind === 'panel').length,
      framePieces: pieces.filter((p) => p.kind === 'frame').length,
      volume,
      width: ob.max[0] - ob.min[0],
      height: ob.max[1] - ob.min[1],
    },
  };
  return { project, layout, scope: s, outer, inner, lipInner, lip, gridRegion, allowed, hasFrame, frontZ, cuts, regions, frameParts };
}

function centroid(polys: Vec2[][]): Vec2 {
  let a = 0,
    cx = 0,
    cy = 0;
  for (const p of polys)
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i];
      const [x1, y1] = p[(i + 1) % p.length];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
  return a ? [cx / (3 * a), cy / (3 * a)] : [0, 0];
}

/** Split an ordered list into the fewest groups of at most `max`, as evenly as possible. */
export function splitEven<T>(items: T[], max: number): T[][] {
  if (!items.length) return [];
  const g = Math.ceil(items.length / max);
  const base = Math.floor(items.length / g);
  let extra = items.length - base * g;
  // Hand the larger groups out from the middle so the layout stays symmetric-ish.
  const sizes = Array(g).fill(base);
  const order = Array.from({ length: g }, (_, i) => i).sort(
    (a, b) => Math.abs(a - (g - 1) / 2) - Math.abs(b - (g - 1) / 2),
  );
  for (const i of order) {
    if (!extra) break;
    sizes[i]++;
    extra--;
  }
  const out: T[][] = [];
  let k = 0;
  for (const n of sizes) {
    out.push(items.slice(k, k + n));
    k += n;
  }
  return out;
}

function mountTargets(bbox: [number, number, number, number], n: number): Vec2[] {
  const [x0, y0, x1, y1] = bbox;
  const ix = (x1 - x0) * 0.22,
    iy = (y1 - y0) * 0.22;
  const L = x0 + ix,
    R = x1 - ix,
    B = y0 + iy,
    T = y1 - iy,
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const sets: Record<number, Vec2[]> = {
    0: [],
    1: [[cx, cy]],
    2: [
      [L, T],
      [R, B],
    ],
    3: [
      [L, T],
      [R, T],
      [cx, B],
    ],
    4: [
      [L, T],
      [R, T],
      [L, B],
      [R, B],
    ],
    5: [
      [L, T],
      [R, T],
      [L, B],
      [R, B],
      [cx, cy],
    ],
    6: [
      [L, T],
      [R, T],
      [L, B],
      [R, B],
      [L, cy],
      [R, cy],
    ],
  };
  return sets[Math.max(0, Math.min(6, Math.round(n)))];
}

// ---- Frame splitting -------------------------------------------------------

export type FrameCut = { p: Vec2; t: Vec2; s: number };
type Cut = FrameCut;
export interface FrameSplit {
  pieces: CrossSection[];
  /** cuts[j] is where piece j starts; piece j ends at cuts[j + 1]. */
  cuts: FrameCut[];
}

/** Rectangle centred on a cut, `len` long along the outline and covering the band across it. */
export function lapRect(K: Kernel, s: Scope, c: FrameCut, len: number, width: number): CrossSection {
  const n: Vec2 = [-c.t[1], c.t[0]]; // inward normal of a CCW outline
  const pt = (a: number, b: number): Vec2 => [c.p[0] + c.t[0] * a + n[0] * b, c.p[1] + c.t[1] * a + n[1] * b];
  return s.t(new K.CrossSection([ccw([pt(-len / 2, -10), pt(len / 2, -10), pt(len / 2, width + 10), pt(-len / 2, width + 10)])]));
}

interface Ring {
  pts: Vec2[];
  cum: number[];
  length: number;
  curved: number[]; // arc positions of curved vertices
}

function ring(poly: Vec2[]): Ring {
  const pts = ccw(poly);
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i % n];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const curved: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n],
      q = pts[i],
      r = pts[(i + 1) % n];
    const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const a2 = Math.atan2(r[1] - q[1], r[0] - q[0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 0.01) curved.push(cum[i]);
  }
  return { pts, cum, length: cum[n], curved };
}

function pointAt(rg: Ring, s: number): { p: Vec2; t: Vec2 } {
  const L = rg.length;
  s = ((s % L) + L) % L;
  let i = 0;
  while (i < rg.pts.length - 1 && rg.cum[i + 1] < s) i++;
  const a = rg.pts[i],
    b = rg.pts[(i + 1) % rg.pts.length];
  const seg = rg.cum[i + 1] - rg.cum[i] || 1;
  const k = (s - rg.cum[i]) / seg;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return {
    p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k],
    t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
  };
}

function splitFrame(
  K: Kernel,
  s: Scope,
  outer: CrossSection,
  band: CrossSection,
  width: number,
  bedW: number,
  bedH: number,
  lapLen: number,
): FrameSplit | null {
  const CS = K.CrossSection;
  const bandPolys = polysOf(band);
  if (fitOnBed(bandPolys, bedW, bedH).angle !== null) return { pieces: [band], cuts: [] };

  const outerPolys = polysOf(outer);
  const main = outerPolys.reduce((a, p) => (Math.abs(signedArea(p)) > Math.abs(signedArea(a)) ? p : a));
  const rg = ring(main);
  const ob = outer.bounds();
  const C: Vec2 = [(ob.min[0] + ob.max[0]) / 2, (ob.min[1] + ob.max[1]) / 2];
  const BIG = 1e5;
  const bandArea = band.area();

  const distToCurved = (x: number) => {
    let d = Infinity;
    for (const c of rg.curved) {
      const dd = Math.abs(x - c);
      d = Math.min(d, dd, rg.length - dd);
    }
    return d;
  };

  const halfPlane = (p: Vec2, t: Vec2, ahead: boolean) => {
    const n: Vec2 = [-t[1], t[0]];
    const dir = ahead ? 1 : -1;
    const pts: Vec2[] = [
      [p[0] - n[0] * BIG, p[1] - n[1] * BIG],
      [p[0] - n[0] * BIG + t[0] * BIG * dir, p[1] - n[1] * BIG + t[1] * BIG * dir],
      [p[0] + n[0] * BIG + t[0] * BIG * dir, p[1] + n[1] * BIG + t[1] * BIG * dir],
      [p[0] + n[0] * BIG, p[1] + n[1] * BIG],
    ];
    return s.t(new CS([ccw(pts)]));
  };
  const wedge = (a0: number, a1: number) => {
    while (a1 <= a0) a1 += 2 * Math.PI;
    const pts: Vec2[] = [C];
    const steps = Math.max(2, Math.ceil((a1 - a0) / 0.3));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([C[0] + BIG * Math.cos(a), C[1] + BIG * Math.sin(a)]);
    }
    return s.t(new CS([ccw(pts)]));
  };
  const angleOf = (p: Vec2) => Math.atan2(p[1] - C[1], p[0] - C[0]);

  const build = (cuts: Cut[], radial: boolean) => {
    const m = cuts.length;
    const out: CrossSection[] = [];
    for (let j = 0; j < m; j++) {
      const a = cuts[j],
        b2 = cuts[(j + 1) % m];
      const span = (((b2.s - a.s) % rg.length) + rg.length) % rg.length;
      const delta = Math.min(0.35, ((span / rg.length) * Math.PI * 2) / 3) + Math.atan2(width * 1.5, 50);
      let piece: CrossSection;
      if (radial) {
        piece = s.t(band.intersect(wedge(angleOf(a.p), angleOf(b2.p))));
      } else {
        const w = wedge(angleOf(a.p) - delta, angleOf(b2.p) + delta);
        piece = s.t(
          s.t(s.t(band.intersect(w)).intersect(halfPlane(a.p, a.t, true))).intersect(halfPlane(b2.p, b2.t, false)),
        );
      }
      out.push(piece);
    }
    return out;
  };
  const tryCuts = (cuts: Cut[]) => {
    cuts.sort((a, b) => a.s - b.s);
    let pieces = build(cuts, false);
    const total = pieces.reduce((a, p) => a + p.area(), 0);
    const broken = pieces.some((p) => p.isEmpty() || p.decompose().filter((d) => (s.t(d), d.area() > 1)).length > 1);
    if (Math.abs(total - bandArea) > bandArea * 0.002 || broken) pieces = build(cuts, true);
    const fits = pieces.map((p, j) => {
      let fp = p;
      if (lapLen > 0) {
        const laps = [cuts[j], cuts[(j + 1) % cuts.length]].map((c) => s.t(band.intersect(lapRect(K, s, c, lapLen, width))));
        fp = s.t(CS.union([p, ...laps]));
      }
      return fitOnBed(polysOf(fp), bedW, bedH).angle !== null;
    });
    return { pieces, fits, cuts };
  };

  // Strategy 1: symmetric cuts along the outline's straight edges and, when a
  // corner part is still too big, in the middle of the corner arc.
  const n = rg.pts.length;
  const L = rg.length;
  type Run = { s0: number; len: number; curved: boolean };
  const runs: Run[] = [];
  const straightMin = Math.max(40, 2 * width);
  for (let i = 0; i < n; i++) {
    const len = rg.cum[i + 1] - rg.cum[i];
    const last = runs[runs.length - 1];
    if (len >= straightMin) runs.push({ s0: rg.cum[i], len, curved: false });
    else if (last?.curved && Math.abs(last.s0 + last.len - rg.cum[i]) < 1e-6) last.len += len;
    else runs.push({ s0: rg.cum[i], len, curved: true });
  }
  // A curved stretch can wrap around the start of the ring.
  if (runs.length > 1 && runs[0].curved && runs[runs.length - 1].curved && Math.abs(runs[runs.length - 1].s0 + runs[runs.length - 1].len - L) < 1e-6) {
    const tail = runs.pop()!;
    runs[0] = { s0: tail.s0, len: tail.len + runs[0].len, curved: true };
  }
  const usable = runs.filter((r) => !r.curved || r.len > 5);
  if (usable.some((r) => !r.curved)) {
    // Parts must stay comfortably longer than a lap joint.
    const minSeg = lapLen > 0 ? lapLen + 30 : 40;
    const k: number[] = usable.map((r) => (r.curved ? 0 : 1));
    const inRun = (r: Run, x: number) => ((((x - r.s0) % L) + L) % L) <= r.len;
    const overlaps = (r: Run, from: number, to: number) => {
      const span = (((to - from) % L) + L) % L || L;
      for (let t = 0; t <= 1; t += 1 / 32) if (inRun(r, from + span * t)) return true;
      return false;
    };
    for (let iter = 0; iter < 200; iter++) {
      const cuts: Cut[] = [];
      usable.forEach((run, i) => {
        for (let j = 0; j < k[i]; j++) {
          const at = (run.s0 + ((j + 0.5) * run.len) / k[i]) % L;
          cuts.push({ ...pointAt(rg, at), s: at });
        }
      });
      if (cuts.length >= 3) {
        const res = tryCuts(cuts);
        if (res.fits.every(Boolean)) return { pieces: res.pieces, cuts: res.cuts };
        // Add a cut to the longest stretch inside each part that does not fit.
        const grow = new Set<number>();
        res.fits.forEach((ok, j) => {
          if (ok) return;
          const from = res.cuts[j].s,
            to = res.cuts[(j + 1) % res.cuts.length].s;
          let best = -1,
            bestLen = 0;
          usable.forEach((r, i) => {
            const seg = r.len / (k[i] + 1);
            if (seg >= minSeg && overlaps(r, from, to) && seg > bestLen + (r.curved ? 1 : 0)) {
              best = i;
              bestLen = seg;
            }
          });
          if (best >= 0) grow.add(best);
        });
        if (!grow.size) break;
        for (const i of grow) k[i]++;
      } else {
        const i = usable.reduce((bi, r, j) => (r.len / (k[j] + 1) > usable[bi].len / (k[bi] + 1) ? j : bi), 0);
        k[i]++;
      }
      if (k.reduce((x, y) => x + y, 0) > 80) break;
    }
  }

  // Strategy 2: evenly spaced cuts that avoid curved stretches.
  for (let m = 3; m <= 64; m++) {
    const step = rg.length / m;
    let bestPhase = 0,
      bestScore = -1;
    for (let k = 0; k < 48; k++) {
      const phase = (step * k) / 48;
      let score = Infinity;
      for (let j = 0; j < m; j++) score = Math.min(score, distToCurved(phase + j * step));
      if (score > bestScore + 1e-6) {
        bestScore = score;
        bestPhase = phase;
      }
    }
    const cuts = Array.from({ length: m }, (_, j) => ({ ...pointAt(rg, bestPhase + j * step), s: (bestPhase + j * step) % rg.length }));
    const res = tryCuts(cuts);
    if (res.fits.every(Boolean)) return { pieces: res.pieces, cuts: res.cuts };
  }
  return null;
}

/** Contiguous stretches of the frame mid-line that lie inside a piece. */
function midRuns(mid: Vec2[][], piece: Vec2[][], skip?: (p: Vec2) => boolean) {
  const stepLen = 2;
  if (!mid.length) return { runs: [] as Vec2[][], stepLen };
  const main = mid.reduce((a, p) => (Math.abs(signedArea(p)) > Math.abs(signedArea(a)) ? p : a));
  const rg = ring(main);
  const runs: { s: number; p: Vec2 }[][] = [];
  for (let x = 0; x < rg.length; x += stepLen) {
    const { p } = pointAt(rg, x);
    if (!pointInPolys(p[0], p[1], piece) || skip?.(p)) continue;
    const last = runs[runs.length - 1];
    if (last && x - last[last.length - 1].s <= stepLen * 1.5) last.push({ s: x, p });
    else runs.push([{ s: x, p }]);
  }
  // The piece can wrap around the ring start.
  if (runs.length > 1 && runs[0][0].s < stepLen && rg.length - runs[runs.length - 1].at(-1)!.s <= stepLen * 1.5) {
    const tail = runs.pop()!;
    runs[0] = [...tail, ...runs[0]];
  }
  return { runs: runs.map((r) => r.map((x) => x.p)), stepLen };
}

/** Label position on the frame mid-line, with the direction of the frame there (degrees). */
function frameAnchor(mid: Vec2[][], piece: Vec2[][]): { p: Vec2; angle: number } {
  const { runs } = midRuns(mid, piece);
  const longest = runs.reduce((a, r) => (r.length > a.length ? r : a), [] as Vec2[]);
  if (longest.length) {
    const k = Math.floor(longest.length / 2);
    const a = longest[Math.max(0, k - 3)],
      b = longest[Math.min(longest.length - 1, k + 3)];
    let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    // Keep text upright-ish.
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return { p: longest[k], angle };
  }
  const b = bboxOf(piece);
  return { p: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], angle: 0 };
}

function frameScrews(
  mid: Vec2[][],
  piece: Vec2[][],
  cuts: Cutout[],
  head: number,
  avoid: Vec2[] = [],
  avoidDist = 0,
): Vec2[] {
  const { runs, stepLen } = midRuns(
    mid,
    piece,
    (p) =>
      cuts.some((c) => Math.abs(p[0] - c.x) < c.w / 2 + c.rim + head && Math.abs(p[1] - c.y) < c.h / 2 + c.rim + head) ||
      avoid.some((a) => Math.hypot(a[0] - p[0], a[1] - p[1]) < avoidDist / 2 + 25),
  );
  const out: Vec2[] = [];
  for (const run of runs) {
    const len = run.length * stepLen;
    if (len < head * 2) continue;
    const margin = Math.min(40, len * 0.18);
    const usable = len - 2 * margin;
    const count = len < 120 ? 1 : Math.max(2, Math.ceil(usable / 250) + 1);
    for (let i = 0; i < count; i++) {
      const at = count === 1 ? len / 2 : margin + (usable * i) / (count - 1);
      out.push(run[Math.min(run.length - 1, Math.round(at / stepLen))]);
    }
  }
  return out;
}
