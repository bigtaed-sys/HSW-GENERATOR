// HSW inserts and connectors by PStover, CC BY-NC 4.0
// (https://creativecommons.org/licenses/by-nc/4.0/). Meshes were triangulated
// from his STEP files and healed (welded, consistently oriented); see
// src/assets/pstover/README.md. Their local frame: top face of the lip at
// z = 0, the insert pointing down to z = -10.5, lip 3 mm thick.

import parts from '../assets/pstover/parts.json';
import { canonicalGroup } from './connectors';
import { PITCH_X, PITCH_Y } from './constants';
import type { Kernel, Manifold, Scope } from './kernel';
import type { Vec2 } from './lattice';

/** Lip thickness of PStover's inserts. */
export const PSTOVER_LIP = 3;

type PartName = keyof typeof parts;
const cache = new WeakMap<Kernel, Map<PartName, Manifold>>();

/** A part as a Manifold (cached for the lifetime of the kernel; do not free). */
export function pstoverPart(K: Kernel, name: PartName): Manifold {
  let m = cache.get(K);
  if (!m) cache.set(K, (m = new Map()));
  let part = m.get(name);
  if (!part) {
    const p = parts[name];
    part = new K.Manifold(new K.Mesh({ numProp: 3, vertProperties: new Float32Array(p.v), triVerts: new Uint32Array(p.t) }));
    m.set(name, part);
  }
  return part;
}

/** The standard insert in our accessory frame: lip on the wall face (z 0..3), insert into -z. */
export function pstoverInsert(K: Kernel, s: Scope, tol = 0): Manifold {
  let m = s.t(pstoverPart(K, 'std').translate([0, 0, PSTOVER_LIP]));
  if (Math.abs(tol) > 1e-3) {
    const k = (19.7 + tol) / 19.7;
    m = s.t(m.scale([k, k, 1]));
  }
  return m;
}

interface Group {
  cells: Vec2[];
  mount: number;
  filler?: PartName;
}

// Cell layouts of the assemblies, in the assemblies' own coordinates.
const GROUPS: Group[] = [
  { cells: [[0, 0]], mount: 0 },
  { cells: [[0, 0], [0, PITCH_Y]], mount: 1, filler: 'bar2' },
  { cells: [[0, 0], [0, PITCH_Y], [PITCH_X, PITCH_Y / 2]], mount: 2, filler: 'filler3' },
  { cells: [[0, 0], [0, PITCH_Y], [PITCH_X, PITCH_Y / 2], [PITCH_X, -PITCH_Y / 2]], mount: 1, filler: 'filler4end' },
  { cells: [[0, 0], [0, PITCH_Y], [PITCH_X, PITCH_Y / 2], [PITCH_X, -PITCH_Y / 2]], mount: 2, filler: 'filler4mid' },
];

const keyOf = (offs: Vec2[]) => JSON.stringify(offs.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));

/**
 * PStover's connector matching a group in canonical form (screw cell first, at the
 * origin), positioned in our accessory frame. Returns null when no assembly matches.
 */
export function pstoverConnector(K: Kernel, s: Scope, offsets: Vec2[], tol = 0): Manifold | null {
  const want = keyOf(canonicalGroup(offsets, 0).offsets);
  for (const g of GROUPS) {
    const canon = canonicalGroup(g.cells, g.mount);
    if (keyOf(canon.offsets) !== want) continue;
    const items: Manifold[] = g.cells.map(([x, y], i) => {
      const base = i === g.mount ? s.t(pstoverPart(K, 'mount').translate([0, 0, 0])) : s.t(pstoverPart(K, 'std').translate([0, 0, 0]));
      let m = base;
      if (i !== g.mount && Math.abs(tol) > 1e-3) {
        const k = (19.7 + tol) / 19.7;
        m = s.t(m.scale([k, k, 1]));
      }
      return s.t(m.translate([x, y, 0]));
    });
    if (g.filler) items.push(pstoverPart(K, g.filler));
    const [mx, my] = g.cells[g.mount];
    // Assembly frame → canonical frame (screw at the origin) → lip on the wall face.
    return s.t(
      s.t(s.t(s.t(K.Manifold.union(items)).translate([-mx, -my, 0])).rotate([0, 0, -canon.rot])).translate([0, 0, PSTOVER_LIP]),
    );
  }
  return null;
}
