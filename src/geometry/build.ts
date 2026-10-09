import type { Cutout, Project } from '../model/types';
import { DEPTH, HOLE_PROFILE } from './constants';
import { Scope, type CrossSection, type Kernel, type Manifold } from './kernel';
import { hexagon } from './lattice';
import { textOutline, textWidth } from './text';
import { buildFrameStyle } from './frames/build';
import { frameStyleParams } from './frames/styles';
import { roundedRect, type LayoutInternal } from './layout';
import type { MeshData } from './layoutTypes';

const EPS = 0.02;
/** Height where lap joints split a frame piece. */
const LAP_Z = DEPTH / 2;

/** One HSW hole as a cutting tool, built from convex frusta of the hole profile. */
export function holeTool(K: Kernel, s: Scope, tol = 0): Manifold {
  const { Manifold, CrossSection: CS } = K;
  const prof = HOLE_PROFILE;
  const slab = (z: number, w: number) => s.t(s.t(s.t(new CS([hexagon(w + tol)])).extrude(0.001)).translate([0, 0, z]));
  // Convex pieces: [back chamfer], [straight], [front widening + recess].
  const a = s.t(Manifold.hull([slab(prof[0][0] - EPS * 10, prof[0][1] + 0.04), slab(prof[1][0], prof[1][1])]));
  const b = s.t(Manifold.hull([slab(prof[1][0], prof[1][1]), slab(prof[2][0], prof[2][1])]));
  const c = s.t(
    Manifold.hull([slab(prof[2][0], prof[2][1]), slab(prof[3][0], prof[3][1]), slab(prof[4][0] + 1, prof[4][1])]),
  );
  return s.t(Manifold.union([a, b, c]));
}

/** A hole with a floor and a countersunk screw hole for mounting the panel. */
export function mountTool(K: Kernel, s: Scope, project: Project, hole: Manifold): Manifold {
  const { Manifold } = K;
  const { floor, screwDiameter: sd, headDiameter: hd } = project.mount;
  const slab = s.t(Manifold.cube([40, 40, floor + 1], true).translate([0, 0, (floor - 1) / 2]));
  s.t(slab);
  const shaft = s.t(s.t(Manifold.cylinder(floor + 4, sd / 2 + 0.2, sd / 2 + 0.2, 32)).translate([0, 0, -2]));
  const sinkH = Math.max(0.2, (hd - sd) / 2);
  const cone = s.t(
    s.t(Manifold.cylinder(sinkH + 0.01, sd / 2 + 0.2, hd / 2 + 0.2, 32)).translate([0, 0, floor - sinkH]),
  );
  return s.t(Manifold.union([s.t(hole.subtract(slab)), shaft, cone]));
}

/** Straight through-cut with a chamfered front edge (outline must be convex). */
function chamferedCut(K: Kernel, s: Scope, cs: CrossSection, frontZ: number, ch: number): Manifold {
  const { Manifold } = K;
  const body = s.t(s.t(cs.extrude(frontZ + 2)).translate([0, 0, -1]));
  if (ch <= 0.05) return body;
  const top = s.t(s.t(s.t(cs.offset(ch, 'Round', 2, 32)).extrude(1)).translate([0, 0, frontZ]));
  const mid = s.t(s.t(cs.extrude(0.001)).translate([0, 0, frontZ - ch]));
  return s.t(Manifold.union([body, s.t(Manifold.hull([mid, top]))]));
}

function cutoutTools(K: Kernel, s: Scope, cuts: Cutout[], frontZ: number): Manifold[] {
  return cuts.map((c) => chamferedCut(K, s, roundedRect(K, s, c.x, c.y, c.w, c.h, c.r), frontZ, c.chamfer));
}

/** Space the frame leaves for the panels: up to the panel front at the inner edge, above it only inside the lip. */
function innerCut(K: Kernel, s: Scope, L: LayoutInternal, project: Project): Manifold {
  const front = chamferedCut(K, s, L.lipInner, L.frontZ, project.frame.innerChamfer);
  if (L.lip <= 0) return front;
  // Under the lip: room for the panel edge plus a little clearance.
  const under = s.t(s.t(L.inner.extrude(DEPTH + LIP_CLEARANCE + 1)).translate([0, 0, -1]));
  return s.t(K.Manifold.union([front, under]));
}

const LIP_CLEARANCE = 0.2;

/** Cut for an LED strip: a groove in the frame front, or a rebate at the back outer edge (halo). */
function ledTool(K: Kernel, s: Scope, L: LayoutInternal, project: Project): Manifold | null {
  const { led, width } = project.frame;
  if (led.mode === 'none') return null;
  const { Manifold } = K;
  const ring = (a: number, b: number) =>
    s.t(s.t(L.outer.offset(-a, 'Round', 2, 96)).subtract(s.t(L.outer.offset(-b, 'Round', 2, 96))));
  if (led.mode === 'halo') {
    const w = Math.min(led.width, width - 3);
    const d = Math.min(led.depth, L.frontZ - 2);
    return s.t(s.t(ring(-2, w).extrude(d + 1)).translate([0, 0, -1]));
  }
  const w = Math.min(led.width, width - 3);
  const d = Math.min(led.depth, L.frontZ - 2);
  const groove = s.t(s.t(ring(width / 2 - w / 2, width / 2 + w / 2).extrude(d + 1)).translate([0, 0, L.frontZ - d]));
  if (!led.wire) return groove;
  // Cable hole through to the back at the lowest point of the groove.
  const mid = L.outer.offset(-width / 2, 'Round', 2, 96);
  s.t(mid);
  const pts = mid.toPolygons().flat();
  const low = pts.reduce((a, p) => (p[1] < a[1] ? p : a), pts[0]);
  const hole = s.t(s.t(Manifold.cylinder(L.frontZ + 4, Math.min(3, w / 2), Math.min(3, w / 2), 32)).translate([low[0], low[1], -2]));
  return s.t(groove.add(hole));
}

function screwTool(K: Kernel, s: Scope, project: Project, frontZ: number): Manifold {
  const { Manifold } = K;
  const { screwDiameter: sd, headDiameter: hd } = project.mount;
  const sinkH = (hd - sd) / 2;
  const shaft = s.t(s.t(Manifold.cylinder(frontZ + 4, sd / 2 + 0.2, sd / 2 + 0.2, 32)).translate([0, 0, -2]));
  const cone = s.t(s.t(Manifold.cylinder(sinkH, sd / 2 + 0.2, hd / 2 + 0.2, 32)).translate([0, 0, frontZ - sinkH]));
  const top = s.t(s.t(Manifold.cylinder(2, hd / 2 + 0.2, hd / 2 + 0.2, 32)).translate([0, 0, frontZ - 0.01]));
  return s.t(Manifold.union([shaft, cone, top]));
}

export function toMesh(id: string, m: Manifold): MeshData {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { id, positions, indices: new Uint32Array(mesh.triVerts), volume: m.volume() / 1000 };
}

/** Longest-ish horizontal segment on the bottom of an outline (interior above it), near its middle. */
function bottomEdge(polys: [number, number][][]): { x: number; y: number; len: number } | null {
  let best: { x: number; y: number; len: number } | null = null;
  const xs = polys.flat().map((p) => p[0]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  for (const poly of polys) {
    const area = poly.reduce((a, p, i) => a + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0);
    for (let i = 0; i < poly.length; i++) {
      if (area < 0) break; // holes (cutouts) are not edges of the panel
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      const len = x1 - x0;
      // Going +x on a counter-clockwise outer contour means the material is above.
      if (Math.abs(y1 - y0) > 0.01 || len < 10) continue;
      const cand = { x: (x0 + x1) / 2, y: y0, len };
      if (!best || cand.y < best.y - 1 || (Math.abs(cand.y - best.y) <= 1 && Math.abs(cand.x - mid) < Math.abs(best.x - mid))) best = cand;
    }
  }
  return best;
}

/** Builds one piece (panel or frame segment) in wall coordinates. */
export function buildPiece(K: Kernel, L: LayoutInternal, id: string, cache: Map<string, Manifold>): Manifold | null {
  const project = L.project;
  const { Manifold } = K;
  const region = L.regions.get(id);
  if (!region) return null;
  const s = new Scope();
  try {
    const piece = L.layout.pieces.find((p) => p.id === id)!;
    if (piece.kind === 'panel') {
      const band = L.frameBands.get(id);
      let body = s.t((band ? s.t(region.subtract(band)) : region).extrude(DEPTH));
      const hole = cache.get('hole')!;
      const mount = cache.get('mount')!;
      const cells = L.layout.cells.filter((c) => c.panel === id && c.kind !== 'solid');
      if (cells.length) {
        const tools = cells.map((c) => s.t((c.kind === 'mount' ? mount : hole).translate([c.x, c.y, 0])));
        let holes = s.t(Manifold.compose(tools));
        if (cells.some((c) => c.kind === 'partial')) {
          const clip = s.t(s.t(L.allowed.extrude(DEPTH + 4)).translate([0, 0, -2]));
          holes = s.t(holes.intersect(clip));
        }
        body = s.t(body.subtract(holes));
      }
      const [x0, y0, x1, y1] = piece.bbox;
      const near = L.cuts.filter((c) => c.x + c.w / 2 + c.chamfer > x0 && c.x - c.w / 2 - c.chamfer < x1 && c.y + c.h / 2 + c.chamfer > y0 && c.y - c.h / 2 - c.chamfer < y1);
      if (band) {
        // Integrated frame: this panel's share of the styled frame, joined to the cells.
        const H = L.frontZ + 4;
        const clip = s.t(s.t(band.extrude(H + 2)).translate([0, 0, -2]));
        let framePart = s.t(s.t(cache.get('outer')!.intersect(clip)).subtract(cache.get('inner')!));
        for (const t of cutoutTools(K, s, near, L.frontZ)) framePart = s.t(framePart.subtract(t));
        if (cache.has('led')) framePart = s.t(framePart.subtract(cache.get('led')!));
        if (piece.screws.length) {
          const st = cache.get('screw')!;
          framePart = s.t(framePart.subtract(s.t(Manifold.compose(piece.screws.map(([x, y]) => s.t(st.translate([x, y, 0])))))));
        }
        if (project.printer.engrave && piece.frameAnchor) {
          const h = Math.max(3, Math.min(7, project.frame.width * 0.45));
          const text = textOutline(K, s, piece.label, h, Math.max(0.8, h * 0.14), { mirror: true, angle: piece.frameAnchorAngle ?? 0 });
          const [x, y] = piece.frameAnchor;
          framePart = s.t(framePart.subtract(s.t(s.t(text.extrude(1.6)).translate([x, y, -1]))));
        }
        body = s.t(body.add(framePart));
      }
      for (const t of cutoutTools(K, s, near, DEPTH)) body = s.t(body.subtract(t));
      if (project.printer.engrave && !band) {
        const mounts = cells.filter((c) => c.kind === 'mount').sort((a, b) => b.y - a.y || a.x - b.x);
        const edge = bottomEdge(piece.polys);
        if (mounts.length) {
          // Label on the floor of the top-left screw cell, above the countersink.
          const c = mounts[0];
          const h = Math.min(3.6, (12 * 6) / Math.max(1, piece.label.length * 6 - 2));
          const text = textOutline(K, s, piece.label, h, 0.6);
          const depth = Math.min(0.5, project.mount.floor - 1);
          const tool = s.t(s.t(text.extrude(depth + 1)).translate([c.x, c.y + 6.6, project.mount.floor - depth]));
          body = s.t(body.subtract(tool));
        } else if (edge) {
          // Label on a flat face of the panel's bottom edge, reading from below with the front up.
          const h = Math.min(4.5, (Math.min(12, edge.len - 1.5) * 6) / Math.max(1, piece.label.length * 6 - 2));
          const depth = 0.4;
          const text = textOutline(K, s, piece.label, h, 0.7);
          const tool = s.t(s.t(s.t(text.extrude(depth + 1)).rotate([90, 0, 0])).translate([edge.x, edge.y + depth, DEPTH / 2 - 0.4]));
          body = s.t(body.subtract(tool));
        }
      }
      return body.asOriginal();
    }
    // Frame piece
    const outer = cache.get('outer')!;
    const inner = cache.get('inner')!;
    const parts = L.frameParts.get(id)!;
    const H = L.frontZ + 4;
    const prism = (cs: CrossSection, z0: number, z1: number) => s.t(s.t(cs.extrude(z1 - z0)).translate([0, 0, z0]));
    const clips = [prism(parts.core, -2, H)];
    // Lap joints: half-height ends that lie on top of or underneath the neighbouring parts.
    for (const h of parts.high) clips.push(prism(h, LAP_Z, H));
    for (const l of parts.low) clips.push(prism(l, -2, LAP_Z));
    const clip = s.t(Manifold.union(clips));
    let body = s.t(s.t(outer.intersect(clip)).subtract(inner));
    for (const t of cutoutTools(K, s, L.cuts, L.frontZ)) body = s.t(body.subtract(t));
    if (cache.has('led')) body = s.t(body.subtract(cache.get('led')!));
    if (project.printer.engrave) {
      // Mirrored label on the back face, readable when the part is turned over.
      const h = Math.max(3, Math.min(7, project.frame.width * 0.45));
      const w = textWidth(piece.label, h);
      const a = (piece.anchorAngle * Math.PI) / 180;
      let [x, y] = piece.anchor;
      const clear = w / 2 + project.mount.headDiameter / 2 + 2;
      if (piece.screws.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < clear)) {
        x += Math.cos(a) * clear;
        y += Math.sin(a) * clear;
      }
      const text = textOutline(K, s, piece.label, h, Math.max(0.8, h * 0.14), { mirror: true, angle: piece.anchorAngle });
      body = s.t(body.subtract(s.t(s.t(text.extrude(1.6)).translate([x, y, -1]))));
    }
    if (piece.screws.length) {
      const st = cache.get('screw')!;
      body = s.t(body.subtract(s.t(Manifold.compose(piece.screws.map(([x, y]) => s.t(st.translate([x, y, 0])))))));
    }
    return body.asOriginal();
  } finally {
    s.free();
  }
}

/** Shared tools for a layout; caller frees the scope. */
export function prepareTools(K: Kernel, L: LayoutInternal, project: Project, s: Scope) {
  const cache = new Map<string, Manifold>();
  const hole = holeTool(K, s, project.printer.holeTolerance);
  cache.set('hole', hole);
  cache.set('mount', mountTool(K, s, project, hole));
  if (L.hasFrame) {
    cache.set(
      'outer',
      buildFrameStyle({
        K,
        s,
        style: project.frame.style,
        outer: L.outer,
        width: project.frame.width + L.lip,
        frontZ: L.frontZ,
        p: frameStyleParams(project.frame),
      }),
    );
    if (L.lip > 0) {
      // Whatever the style does to the inner part, keep a solid ledge over the panel edges.
      const ledgeTop = Math.min(L.frontZ, DEPTH + LIP_CLEARANCE + 1.4);
      const zone = s.t(s.t(L.outer.offset(-(project.frame.width - 1.5), 'Round', 2, 96)).subtract(L.lipInner));
      const ledge = s.t(s.t(zone.extrude(ledgeTop + 0.5)).translate([0, 0, -0.5]));
      cache.set('outer', s.t(cache.get('outer')!.add(ledge)));
    }
    cache.set('inner', innerCut(K, s, L, project));
    // With a front LED groove the screws sit (hidden) at the bottom of the groove.
    const ledFront = project.frame.led.mode === 'front';
    cache.set('screw', screwTool(K, s, project, L.frontZ - (ledFront ? Math.min(project.frame.led.depth, L.frontZ - 2) : 0)));
    const led = ledTool(K, s, L, project);
    if (led) cache.set('led', led);
  }
  return cache;
}
