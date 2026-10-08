import type { Cutout, Project } from '../model/types';
import { DEPTH, HOLE_PROFILE } from './constants';
import { Scope, type CrossSection, type Kernel, type Manifold } from './kernel';
import { hexagon } from './lattice';
import { roundedRect, type LayoutInternal } from './layout';
import type { MeshData } from './layoutTypes';

const EPS = 0.02;

/** One HSW hole as a cutting tool, built from convex frusta of the hole profile. */
export function holeTool(K: Kernel, s: Scope): Manifold {
  const { Manifold, CrossSection: CS } = K;
  const prof = HOLE_PROFILE;
  const slab = (z: number, w: number) => s.t(s.t(s.t(new CS([hexagon(w)])).extrude(0.001)).translate([0, 0, z]));
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

/** Outer body of the frame with the selected front-edge profile (outline must be convex). */
function profiledOuter(K: Kernel, s: Scope, L: LayoutInternal, project: Project): Manifold {
  const { Manifold } = K;
  const { profile } = project.frame;
  const H = L.frontZ;
  const p = Math.max(0, Math.min(project.frame.profileSize, project.frame.width - 1, H - 1));
  if (profile === 'square' || p < 0.2) return s.t(s.t(L.outer.extrude(H + EPS)).translate([0, 0, -EPS / 2]));
  const layer = (inset: number, z: number) =>
    s.t(s.t(s.t(inset > 0 ? s.t(L.outer.offset(-inset, 'Round', 2, 96)) : L.outer).extrude(0.001)).translate([0, 0, z]));
  const layers: Manifold[] = [layer(0, -EPS), layer(0, H - p)];
  if (profile === 'chamfer') layers.push(layer(p, H - 0.001));
  else
    for (let i = 1; i <= 8; i++) {
      const a = (Math.PI / 2) * (i / 8);
      layers.push(layer(p * (1 - Math.cos(a)), H - p + p * Math.sin(a) - (i === 8 ? 0.001 : 0)));
    }
  return s.t(Manifold.hull(layers));
}

function innerCut(K: Kernel, s: Scope, L: LayoutInternal, project: Project): Manifold {
  return chamferedCut(K, s, L.inner, L.frontZ, project.frame.innerChamfer);
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

/** Builds one piece (panel or frame segment) in wall coordinates. */
export function buildPiece(K: Kernel, L: LayoutInternal, id: string, cache: Map<string, Manifold>): Manifold | null {
  const { Manifold } = K;
  const region = L.regions.get(id);
  if (!region) return null;
  const s = new Scope();
  try {
    const piece = L.layout.pieces.find((p) => p.id === id)!;
    if (piece.kind === 'panel') {
      let body = s.t(region.extrude(DEPTH));
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
      for (const t of cutoutTools(K, s, near, DEPTH)) body = s.t(body.subtract(t));
      return body.asOriginal();
    }
    // Frame piece
    const outer = cache.get('outer')!;
    const inner = cache.get('inner')!;
    const clip = s.t(s.t(region.extrude(L.frontZ + 4)).translate([0, 0, -2]));
    let body = s.t(s.t(outer.intersect(clip)).subtract(inner));
    for (const t of cutoutTools(K, s, L.cuts, L.frontZ)) body = s.t(body.subtract(t));
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
  const hole = holeTool(K, s);
  cache.set('hole', hole);
  cache.set('mount', mountTool(K, s, project, hole));
  if (L.hasFrame) {
    cache.set('outer', profiledOuter(K, s, L, project));
    cache.set('inner', innerCut(K, s, L, project));
    cache.set('screw', screwTool(K, s, project, L.frontZ));
  }
  return cache;
}
