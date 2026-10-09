import type { Cutout, GridSettings, Project } from '../model/types';
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
import { cellAt, cellCenter, hexagon, latticeRange, tile, type Vec2 } from './lattice';
import { placeConnectors } from './connectors';
import { frameStyleParams } from './frames/styles';
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
  /** Integrated frame: the part of the frame band each edge panel carries. */
  frameBands: Map<string, CrossSection>;
  /** Pockets of the decorative frame pattern (2D), cut into the frame front. */
  pattern: FramePattern | null;
  /** Backlit cells: patches behind the frame seams. */
  plates: CrossSection[];
}

/** A frame piece: full-height core plus half-height lap ends lying on top of (high) or under (low) its neighbours. */
export interface FrameParts {
  core: CrossSection;
  high: CrossSection[];
  low: CrossSection[];
}

function shapePolygon(project: Project): Vec2[] {
  const { shape, width: w, height: h } = project.wall;
  if (shape === 'custom' && project.wall.points?.length >= 3) return project.wall.points.map(([x, y]) => [x, y] as Vec2);
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
    if (r > 0.05) {
      // Round outside corners, then (for custom outlines) inside corners too.
      outer = s.t(s.t(outer.offset(-r, 'Miter')).offset(r, 'Round', 2, 96));
      if (wall.shape === 'custom') outer = s.t(s.t(outer.offset(r, 'Round', 2, 96)).offset(-r, 'Miter'));
    }
    if (outer.isEmpty()) warnings.push('warnBadOutline');
  }

  const hasFrame = !honeycomb && frame.width > 0.01;
  const inner = hasFrame ? s.t(outer.offset(-frame.width, 'Round', 2, 96)) : outer;
  // The lip is the part of the frame front that reaches over the panel edges.
  const integrated = hasFrame && frame.mode === 'integrated';
  const lip = hasFrame && !integrated && frame.proud >= 1 ? Math.max(0, frame.lip) : 0;
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
    // An integrated frame makes the edge panels bigger. Reserve the frame width on
    // edge panels; if an edge panel still does not fit (e.g. at an acute corner),
    // reserve more and lay the panels out again.
    const panelOf = new Map<string, string>();
    let reserve = integrated ? frame.width : 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      regions.clear();
      pieces.length = 0;
      panelOf.clear();
      // An integrated frame makes the edge panels wider by the frame width.
      const kOf = (w: number) => Math.max(1, Math.floor((w / TILE_R - 0.5) / 1.5));
      const nOf = (h: number) => Math.max(1, Math.floor((h - PITCH_Y / 2) / PITCH_Y));
      const colGroups = reserve
        ? splitWithEdges(usedCols, kOf(usableW - 2 * reserve), kOf(usableW - reserve), kMax)
        : splitEven(usedCols, kMax);
      const rowGroups = reserve
        ? splitWithEdges(usedRows, nOf(usableH - 2 * reserve), nOf(usableH - reserve), nMax)
        : splitEven(usedRows, nMax);

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
      if (!integrated) break;
      const trialBand = s.t(s.t(outer.subtract(inner)).subtract(allCuts));
      const owned = integrateFrame(K, s, outer, inner, trialBand, frame.width, pieces);
      const fits = pieces.every((pc) => {
        const part = owned.get(pc.id);
        const fp = part ? s.t(regions.get(pc.id)!.add(part)) : regions.get(pc.id)!;
        return fitOnBed(polysOf(fp), usableW, usableH).angle !== null;
      });
      if (fits) break;
      reserve += frame.width * 0.75 + 10;
    }
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

  const frontZ = DEPTH + (hasFrame ? frame.proud : 0);
  const frameBands = new Map<string, CrossSection>();
  if (integrated && !inner.isEmpty()) {
    const band = s.t(s.t(outer.subtract(inner)).subtract(allCuts));
    const panels = pieces.filter((p) => p.kind === 'panel');
    const owned = integrateFrame(K, s, outer, inner, band, frame.width, panels);
    const mid = polysOf(s.t(outer.offset(-frame.width / 2, 'Round', 2, 96)));
    const screwOk = frame.screws && frame.width >= mount.headDiameter + 3;
    for (const p of panels) {
      const part = owned.get(p.id);
      if (!part || part.isEmpty()) continue;
      frameBands.set(p.id, part);
      // Grow the cell part a hair so it fuses with its frame part along slanted edges.
      const footprint = s.t(s.t(s.t(regions.get(p.id)!.offset(0.01, 'Miter')).intersect(outer)).add(part));
      regions.set(p.id, footprint);
      const bandPolys = polysOf(part);
      p.polys = polysOf(footprint);
      p.bbox = bboxOf(p.polys);
      p.framePolys = bandPolys;
      if (screwOk) p.screws = frameScrews(mid, bandPolys, cuts, mount.headDiameter);
      const a = frameAnchor(mid, bandPolys);
      p.frameAnchor = a.p;
      p.frameAnchorAngle = a.angle;
      p.volume += (part.area() * frontZ) / 1000;
    }
  }
  // Panels must be one piece each: stray bits (tile corners at slanted edges,
  // frame pieces that ended up apart from their panel) join a touching panel.
  consolidatePanels(K, s, pieces.filter((p) => p.kind === 'panel'), regions, cells, [usableW, usableH]);
  for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].kind === 'panel' && !regions.has(pieces[i].id)) pieces.splice(i, 1);
  if (integrated) {
    const band = s.t(s.t(outer.subtract(inner)).subtract(allCuts));
    const midLine = polysOf(s.t(outer.offset(-frame.width / 2, 'Round', 2, 96)));
    for (const p of pieces) {
      if (p.kind !== 'panel') continue;
      const part = s.t(regions.get(p.id)!.intersect(band));
      if (part.area() > 1) {
        frameBands.set(p.id, part);
        p.framePolys = polysOf(part);
        const a = frameAnchor(midLine, p.framePolys);
        p.frameAnchor = a.p;
        p.frameAnchorAngle = a.angle;
        p.screws = frame.screws && frame.width >= mount.headDiameter + 3 ? frameScrews(midLine, p.framePolys, cuts, mount.headDiameter) : [];
      } else {
        p.screws = [];
        frameBands.delete(p.id);
        delete p.framePolys;
      }
    }
  }

  // ---- Connectors ----------------------------------------------------------
  const connectors =
    mount.mode === 'connectors'
      ? placeConnectors(cells, pieces.filter((p) => p.kind === 'panel'), project.cells, {
          junctions: mount.junctions,
          seams: mount.seams,
          seamSpacing: mount.spacing,
          edges: mount.edges,
          edgeSpacing: mount.edgeSpacing,
          minPerPanel: mount.minPerPanel,
        })
      : [];
  for (const k of connectors) Object.assign(k.params, { screw: mount.screwDiameter, head: mount.headDiameter });
  if (connectors.length) {
    const taken = new Set(connectors.flatMap((k) => k.cells.map((c) => cellKey(c.c, c.r))));
    for (const c of cells) if (taken.has(cellKey(c.c, c.r))) c.kind = 'conn';
  }

  // ---- Frame pieces --------------------------------------------------------
  const frameParts = new Map<string, FrameParts>();
  const seams: { c: FrameCut; width: number }[] = [];
  if (hasFrame && !integrated && !inner.isEmpty()) {
    const band = s.t(s.t(outer.subtract(lipInner)).subtract(allCuts));
    // Backlit cells: parts meet along the grooves, with a patch behind each seam instead of laps.
    const lit = frame.style === 'lit';
    const lapLen = frame.joint === 'lap' && !lit ? Math.max(10, frame.jointLength) : 0;
    const bandW = frame.width + lip;
    const split = splitFrame(K, s, outer, band, bandW, usableW, usableH, lapLen, lit ? grid : undefined);
    if (lit && split && split.cuts.length > 1) seams.push(...split.cuts.map((c) => ({ c, width: bandW })));
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
      // Shrink the lap a hair when cutting it out so core and lap overlap and fuse (slanted edges are not exact).
      for (const lap of [...pp.high, ...pp.low]) pp.core = s.t(pp.core.subtract(s.t(lap.offset(-0.02, 'Miter'))));
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

  // ---- Decorative pattern on the frame front -----------------------------
  if (hasFrame && frame.style === 'lit') {
    // Backlit cells: move each frame screw to the middle of the nearest tile of the pattern.
    for (const p of pieces) {
      const own = p.kind === 'frame' ? p.polys : p.framePolys;
      if (!own) continue;
      p.screws = p.screws.map(([x, y]) => {
        const { c, r } = cellAt(x, y, grid);
        const q = cellCenter(c, r, grid);
        const room = mount.headDiameter / 2 + 2;
        const ok = Math.hypot(q[0] - x, q[1] - y) < PITCH_Y * 0.7 && [[0, 0], [room, 0], [-room, 0], [0, room], [0, -room]].every(([dx, dy]) => pointInPolys(q[0] + dx, q[1] + dy, own));
        return ok ? q : [x, y];
      });
    }
  }
  const pattern = hasFrame && !inner.isEmpty() && (frame.style === 'cells' || frame.style === 'lit')
    ? framePattern(K, s, project, outer, inner, lipInner, cuts, cutCS, pieces.flatMap((p) => p.screws), [...frameParts.values()].flatMap((f) => [...f.high, ...f.low]))
    : null;

  // Patches glued behind the seams of a Backlit cells frame, under the front plate.
  const plates: CrossSection[] = [];
  if (pattern?.hollow) {
    const room = s.t(pattern.hollow.offset(-0.3, 'Miter'));
    const w = Math.max(6, frameStyleParams(frame).patchWidth ?? 16);
    for (const { c, width } of seams) {
      const seam = seamPath(K, s, c, width, grid, 0.05);
      if (!seam) continue;
      const plate = s.t(s.t(seam.offset(w / 2, 'Miter')).intersect(room));
      if (plate.area() > 20) plates.push(plate);
    }
  }

  const ob = outer.bounds();
  const layout: Layout = {
    outer: polysOf(outer),
    inner: hasFrame ? polysOf(inner) : [],
    pattern: pattern ? polysOf(pattern.cut) : undefined,
    plates: plates.map((p, i) => ({ id: `j${i}`, label: `J${i + 1}`, polys: polysOf(p) })),
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
  return { project, layout, scope: s, outer, inner, lipInner, lip, gridRegion, allowed, hasFrame, frontZ, cuts, regions, frameParts, frameBands, pattern, plates };
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

/**
 * Like splitEven, but the first and last group may hold fewer items (they also
 * carry part of an integrated frame). `single` is the limit when one group takes all.
 */
export function splitWithEdges<T>(items: T[], single: number, edge: number, middle: number): T[][] {
  const n = items.length;
  if (!n) return [];
  if (n <= single) return [items];
  let g = 2;
  while (2 * edge + (g - 2) * middle < n && g < 1000) g++;
  const sizes = Array.from({ length: g }, (_, i) => (i === 0 || i === g - 1 ? edge : middle));
  // Trim the largest groups one at a time, middle-out, until the sizes add up.
  const order = Array.from({ length: g }, (_, i) => i).sort(
    (a, b) => Math.abs(a - (g - 1) / 2) - Math.abs(b - (g - 1) / 2),
  );
  let excess = sizes.reduce((a, b) => a + b, 0) - n;
  while (excess > 0) {
    const max = Math.max(...sizes);
    const i = order.find((j) => sizes[j] === max)!;
    sizes[i]--;
    excess--;
  }
  const out: T[][] = [];
  let k = 0;
  for (const sz of sizes) {
    out.push(items.slice(k, k + sz));
    k += sz;
  }
  return out;
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

export function pointAt(rg: Ring, s: number): { p: Vec2; t: Vec2 } {
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

/**
 * Cuts a frame band (between a convex outline and an inner offset) into pieces at
 * the given positions along the outline, with cuts square to the outline. Falls
 * back to radial cuts when that leaves stray bits.
 */
/**
 * A cut across the frame band along the walls of the wall's honeycomb (the
 * grooves of the Backlit cells style), as a thin zigzag strip of width `w`:
 * the shared edge of the tiles on either side of the straight cut at `c`.
 */
export function seamPath(K: Kernel, s: Scope, c: FrameCut, width: number, grid: GridSettings, w: number): CrossSection | null {
  const CS = K.CrossSection;
  const n: Vec2 = [-c.t[1], c.t[0]];
  const pt = (a: number, b: number): Vec2 => [c.p[0] + c.t[0] * a + n[0] * b, c.p[1] + c.t[1] * a + n[1] * b];
  const box = [pt(-40, -20), pt(40, -20), pt(-40, width + 20), pt(40, width + 20)];
  const xs = box.map((q) => q[0]),
    ys = box.map((q) => q[1]);
  const { c0, c1, r0, r1 } = latticeRange(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), grid);
  const left: Vec2[][] = [],
    right: Vec2[][] = [];
  for (let i = c0; i <= c1; i++)
    for (let j = r0; j <= r1; j++) {
      const [x, y] = cellCenter(i, j, grid);
      const along = (x - c.p[0]) * c.t[0] + (y - c.p[1]) * c.t[1];
      const across = (x - c.p[0]) * n[0] + (y - c.p[1]) * n[1];
      if (across < -PITCH_Y || across > width + PITCH_Y || Math.abs(along) > PITCH_Y * 1.3) continue;
      (along < 0 ? left : right).push(tile(x, y));
    }
  if (!left.length || !right.length) return null;
  const a = s.t(s.t(new CS(left, 'Positive')).offset(w / 2, 'Miter'));
  const b = s.t(s.t(new CS(right, 'Positive')).offset(w / 2, 'Miter'));
  const seam = s.t(a.intersect(b));
  return seam.isEmpty() ? null : seam;
}

export function bandCutter(K: Kernel, s: Scope, outer: CrossSection, band: CrossSection, width: number, grid?: GridSettings) {
  const CS = K.CrossSection;
  const outerPolys = polysOf(outer);
  const main = outerPolys.reduce((a, p) => (Math.abs(signedArea(p)) > Math.abs(signedArea(a)) ? p : a));
  const rg = ring(main);
  const KERF = 0.05;

  // A thin slot square to the outline at each cut, reaching just across the band.
  // Works for any outline, convex or not: the slot only touches the band locally.
  const slot = (c: Cut) => {
    const n: Vec2 = [-c.t[1], c.t[0]];
    const pt = (a: number, b2: number): Vec2 => [c.p[0] + c.t[0] * a + n[0] * b2, c.p[1] + c.t[1] * a + n[1] * b2];
    return s.t(new CS([ccw([pt(-KERF / 2, -5), pt(KERF / 2, -5), pt(KERF / 2, width + 5), pt(-KERF / 2, width + 5)])]));
  };

  const cut = (cuts: Cut[]): CrossSection[] => {
    cuts.sort((a, b) => a.s - b.s);
    const m = cuts.length;
    if (m < 2) return [band];
    const tool = (c: Cut) => (grid ? seamPath(K, s, c, width, grid, KERF) ?? slot(c) : slot(c));
    const parts = s.t(band.subtract(s.t(CS.union(cuts.map(tool))))).decompose().map((d) => s.t(d));
    const polys = parts.map((p) => polysOf(p));
    // Probe the middle of each stretch between cuts to find its piece.
    const owner = new Array<number>(parts.length).fill(-1);
    const probes: Vec2[] = [];
    for (let j = 0; j < m; j++) {
      const a = cuts[j].s,
        b2 = cuts[(j + 1) % m].s;
      const span = (((b2 - a) % rg.length) + rg.length) % rg.length;
      const { p, t } = pointAt(rg, a + span / 2);
      const q: Vec2 = [p[0] - t[1] * (width / 2), p[1] + t[0] * (width / 2)];
      probes.push(q);
      polys.forEach((pp, i) => {
        if (owner[i] < 0 && pointInPolys(q[0], q[1], pp)) owner[i] = j;
      });
    }
    // Leftovers (e.g. bits beside a cutout) join the stretch whose probe is closest.
    polys.forEach((pp, i) => {
      if (owner[i] >= 0) return;
      const [cx, cy] = centroid(pp);
      let bj = 0,
        bd = Infinity;
      probes.forEach((q, j) => {
        const d = (q[0] - cx) ** 2 + (q[1] - cy) ** 2;
        if (d < bd) {
          bd = d;
          bj = j;
        }
      });
      owner[i] = bj;
    });
    return Array.from({ length: m }, (_, j) => {
      const mine = parts.filter((_, i) => owner[i] === j);
      return mine.length ? s.t(CS.union(mine)) : s.t(new CS([[]]));
    });
  };
  return { rg, cut };
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
  grid?: GridSettings,
): FrameSplit | null {
  const CS = K.CrossSection;
  const bandPolys = polysOf(band);
  if (fitOnBed(bandPolys, bedW, bedH).angle !== null) return { pieces: [band], cuts: [] };

  const cutter = bandCutter(K, s, outer, band, width, grid);
  const rg = cutter.rg;
  const distToCurved = (x: number) => {
    let d = Infinity;
    for (const c of rg.curved) {
      const dd = Math.abs(x - c);
      d = Math.min(d, dd, rg.length - dd);
    }
    return d;
  };
  const tryCuts = (cuts: Cut[]) => {
    const pieces = cutter.cut(cuts);
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

/**
 * Integrated frame: splits the frame band between the edge panels. Cuts run square
 * to the outline from the points where seams between panels meet the inner edge.
 */
function integrateFrame(
  K: Kernel,
  s: Scope,
  outer: CrossSection,
  inner: CrossSection,
  band: CrossSection,
  width: number,
  panels: LayoutPiece[],
): Map<string, CrossSection> {
  const out = new Map<string, CrossSection>();
  const innerPolys = polysOf(inner);
  if (!innerPolys.length || !panels.length) return out;
  const main = innerPolys.reduce((a, p) => (Math.abs(signedArea(p)) > Math.abs(signedArea(a)) ? p : a));
  const ri = ring(main);
  // Which panel owns the inner edge, sampled just inside it.
  const step = 1;
  const owners: (string | null)[] = [];
  const pts: Vec2[] = [];
  for (let x = 0; x < ri.length; x += step) {
    const { p, t } = pointAt(ri, x);
    // Probe well inside the edge (about a cell deep) so the zigzag of the seams right at
    // the edge does not flip the owner back and forth; fall back to a shallow probe.
    pts.push(p);
    // Majority along a short ray into the panels: local enough to follow the
    // panel actually behind this stretch, deep enough to ignore the zigzag.
    const votes = new Map<string, number>();
    for (const depth of [0.8, 3, 6, 9, 12, 15, 18]) {
      const q: Vec2 = [p[0] - t[1] * depth, p[1] + t[0] * depth];
      const id = panels.find((pc) => pointInPolys(q[0], q[1], pc.polys))?.id;
      if (id) votes.set(id, (votes.get(id) ?? 0) + 1);
    }
    let id: string | null = null;
    for (const [k, v] of votes) if (!id || v > votes.get(id)!) id = k;
    owners.push(id);
  }
  // Fill gaps (cutouts at the edge) from the previous owner.
  let last = owners.find((o) => o) ?? null;
  for (let i = 0; i < owners.length; i++) owners[i] = owners[i] ?? last, (last = owners[i]);
  // Along slanted edges the zigzag seam flips owners back and forth; fold
  // stretches shorter than minRun into the longer neighbouring stretch.
  const minRun = Math.max(40, width * 2) / step;
  for (let pass = 0; pass < 20; pass++) {
    const runs: { id: string | null; start: number; len: number }[] = [];
    owners.forEach((o, i) => {
      const r = runs[runs.length - 1];
      if (r && r.id === o) r.len++;
      else runs.push({ id: o, start: i, len: 1 });
    });
    if (runs.length > 1 && runs[0].id === runs[runs.length - 1].id) {
      const tail = runs.pop()!;
      runs[0].start = tail.start;
      runs[0].len += tail.len;
    }
    const short = runs.filter((r) => r.len < minRun).sort((a, b) => a.len - b.len)[0];
    if (!short || runs.length <= 1) break;
    const k = runs.indexOf(short);
    const prev = runs[(k - 1 + runs.length) % runs.length],
      next = runs[(k + 1) % runs.length];
    const into = prev.len >= next.len ? prev.id : next.id;
    for (let j = 0; j < short.len; j++) owners[(short.start + j) % owners.length] = into;
  }
  const ids = new Set(owners.filter(Boolean));
  if (ids.size <= 1) {
    if (last) out.set(last, band);
    return out;
  }
  const cutter = bandCutter(K, s, outer, band, width);
  const ro = cutter.rg;
  // Seam exits on the inner edge, carried straight out to the outer edge.
  const nearestOnOuter = (p: Vec2) => {
    let best = 0,
      bd = Infinity;
    for (let x = 0; x < ro.length; x += 0.5) {
      const q = pointAt(ro, x).p;
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    return best;
  };
  const cuts: FrameCut[] = [];
  for (let i = 0; i < owners.length; i++) {
    const prev = owners[(i - 1 + owners.length) % owners.length];
    if (owners[i] === prev) continue;
    const at = nearestOnOuter(pts[i]);
    cuts.push({ ...pointAt(ro, at), s: at });
  }
  const pieces = cutter.cut(cuts);
  for (const piece of pieces) {
    if (piece.isEmpty()) continue;
    // Owner: the panel along the inner edge closest to the piece.
    const [cx, cy] = centroid(polysOf(piece));
    let bi = 0,
      bd = Infinity;
    pts.forEach((p, i) => {
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const id = owners[bi]!;
    out.set(id, out.has(id) ? s.t(out.get(id)!.add(piece)) : piece);
  }
  return out;
}

/** Merges disconnected bits of panels into the panel they touch most. */
function consolidatePanels(
  K: Kernel,
  s: Scope,
  panels: LayoutPiece[],
  regions: Map<string, CrossSection>,
  cells: LayoutCell[],
  bed: [number, number],
) {
  const fits = (cs: CrossSection) => fitOnBed(polysOf(cs), bed[0], bed[1]).angle !== null;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const p of panels) {
      const reg = regions.get(p.id);
      if (!reg) continue;
      const parts = reg.decompose().map((d) => s.t(d)).filter((d) => d.area() > 0.01);
      if (parts.length <= 1) continue;
      parts.sort((x, y) => y.area() - x.area());
      let keep = parts[0];
      for (const bit of parts.slice(1)) {
        // The neighbour sharing the longest boundary with this bit.
        const grown = s.t(bit.offset(0.3, 'Miter'));
        let best: LayoutPiece | null = null,
          bestA = 0;
        for (const q of panels) {
          if (q === p) continue;
          const a = s.t(grown.intersect(regions.get(q.id)!)).area();
          if (a > bestA) {
            bestA = a;
            best = q;
          }
        }
        const bitPolys = polysOf(bit);
        if (!best || bestA < 0.05) {
          keep = s.t(keep.add(bit));
          continue;
        }
        regions.set(best.id, s.t(s.t(regions.get(best.id)!.offset(0.01, 'Miter')).add(bit)));
        for (const c of cells) if (c.panel === p.id && pointInPolys(c.x, c.y, bitPolys)) c.panel = best.id;
        moved = true;
      }
      regions.set(p.id, keep);
    }
    if (!moved) break;
  }
  // Panels too small to be worth printing on their own (a few cells' worth) join a neighbour.
  const tiny = 3 * (Math.sqrt(3) / 2) * PITCH_Y * PITCH_Y;
  for (const p of [...panels]) {
    const reg = regions.get(p.id);
    if (!reg || reg.area() >= tiny) continue;
    const grown = s.t(reg.offset(0.3, 'Miter'));
    let best: LayoutPiece | null = null,
      bestA = 0;
    for (const q of panels) {
      if (q === p || !regions.has(q.id)) continue;
      const a = s.t(grown.intersect(regions.get(q.id)!)).area();
      // Only merge into a neighbour that still fits the bed afterwards.
      if (a > bestA && fits(s.t(regions.get(q.id)!.add(reg)))) {
        bestA = a;
        best = q;
      }
    }
    if (!best || bestA < 0.05) continue;
    regions.set(best.id, s.t(regions.get(best.id)!.add(reg)));
    regions.delete(p.id);
    for (const c of cells) if (c.panel === p.id) c.panel = best.id;
    panels.splice(panels.indexOf(p), 1);
  }
  for (const p of panels) {
    const reg = regions.get(p.id)!;
    p.polys = polysOf(reg);
    p.bbox = bboxOf(p.polys);
    p.anchor = centroid(p.polys);
  }
  void K;
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

/** Frame relief: what is cut from the front, and for `lit` the hollow under it. */
export interface FramePattern {
  cut: CrossSection;
  hollow: CrossSection | null;
}

/**
 * Frame relief. Small cells: pockets that stay a border away from the edges,
 * cutouts, the LED groove and screws (pockets clipped to less than half are
 * dropped). Backlit cells: the wall's own honeycomb continued over the frame as
 * grooves whose thin floor covers a hollow back, so a strip inside lights
 * the pattern up.
 */
function framePattern(
  K: Kernel,
  s: Scope,
  project: Project,
  outer: CrossSection,
  inner: CrossSection,
  edge: CrossSection,
  cuts: Cutout[],
  cutCS: CrossSection[],
  screws: Vec2[],
  keepSolid: CrossSection[],
): FramePattern | null {
  const { CrossSection: CS } = K;
  const { frame, mount, grid } = project;
  const pt = frameStyleParams(frame);
  const lit = frame.style === 'lit';
  const margin = Math.max(0, lit ? pt.wall : pt.margin);
  const keepOut: CrossSection[] = cuts.map((c, i) => s.t(cutCS[i].offset(c.chamfer + c.rim + (lit ? 2 : margin), 'Round', 2, 48)));
  if (lit) {
    const wall = Math.max(1.2, margin);
    // Inner wall: past the panel edge (and the ledge over it) by `wall`.
    const ledge = edge === inner ? 0 : 1.5;
    let zone = s.t(s.t(outer.offset(-wall, 'Round', 2, 96)).subtract(s.t(inner.offset(wall + ledge, 'Round', 2, 96))));
    for (const k of keepSolid) keepOut.push(s.t(k.offset(1, 'Miter')));
    if (keepOut.length) zone = s.t(zone.subtract(s.t(CS.union(keepOut))));
    if (zone.isEmpty()) return null;
    // Screws sit in the middle of a tile, so the grooves run on; only the hollow keeps a boss around them.
    const bosses = screws.map(([x, y]) => s.t(s.t(CS.circle(mount.headDiameter / 2 + 1.6, 32)).translate([x, y])));
    const hollow = bosses.length ? s.t(zone.subtract(s.t(CS.union(bosses)))) : zone;
    const groove = Math.max(0.8, Math.min(pt.groove, 8));
    const b = zone.bounds();
    const { c0, c1, r0, r1 } = latticeRange(b.min[0], b.min[1], b.max[0], b.max[1], grid);
    const tiles: Vec2[][] = [];
    for (let c = c0; c <= c1; c++)
      for (let r = r0; r <= r1; r++) {
        const [x, y] = cellCenter(c, r, grid);
        tiles.push(hexagon(PITCH_Y - groove, x, y));
      }
    const cut = s.t(zone.subtract(s.t(new CS(tiles, 'Positive'))));
    return cut.isEmpty() ? null : { cut, hollow };
  }
  const size = Math.max(3, pt.cell);
  const rib = Math.max(0.6, Math.min(pt.rib, size - 1.5));
  let zone = s.t(s.t(outer.offset(-margin, 'Round', 2, 96)).subtract(s.t(edge.offset(margin + frame.innerChamfer, 'Round', 2, 96))));
  if (frame.led.mode === 'front') {
    const w = Math.min(frame.led.width, frame.width - 3) / 2 + rib;
    keepOut.push(s.t(s.t(outer.offset(-(frame.width / 2 - w), 'Round', 2, 96)).subtract(s.t(outer.offset(-(frame.width / 2 + w), 'Round', 2, 96)))));
  }
  for (const [x, y] of screws) keepOut.push(s.t(s.t(CS.circle(mount.headDiameter / 2 + rib + 0.5, 32)).translate([x, y])));
  if (keepOut.length) zone = s.t(zone.subtract(s.t(CS.union(keepOut))));
  if (zone.isEmpty()) return null;
  const loose = polysOf(s.t(zone.offset(size, 'Miter')));
  const b = zone.bounds();
  const dx = (size * 1.5) / Math.sqrt(3);
  const flat = size - rib;
  const full = (Math.sqrt(3) / 2) * flat * flat;
  const pockets: Vec2[][] = [];
  for (let i = Math.floor(b.min[0] / dx) - 1; i <= Math.ceil(b.max[0] / dx) + 1; i++) {
    const half = ((i % 2) + 2) % 2 === 1 ? 0.5 : 0;
    for (let j = Math.floor(b.min[1] / size) - 1; j <= Math.ceil(b.max[1] / size) + 1; j++) {
      const x = i * dx,
        y = (j + half) * size;
      if (pointInPolys(x, y, loose)) pockets.push(hexagon(flat, x, y));
    }
  }
  if (!pockets.length) return null;
  const clipped = s.t(s.t(new CS(pockets, 'Positive')).intersect(zone));
  const kept = clipped.decompose().filter((p) => {
    s.t(p);
    return p.area() > full * 0.5;
  });
  return kept.length ? { cut: s.t(CS.compose(kept)), hollow: null } : null;
}
