import type { Scope, CrossSection, Kernel, Manifold } from '../kernel';

export interface FrameCtx {
  K: Kernel;
  s: Scope;
  /** Outer outline (convex). */
  outer: CrossSection;
  /** Frame band width (wall side). */
  width: number;
  /** Height of the frame front. */
  frontZ: number;
  p: Record<string, number>;
}

const EPS = 0.02;

/**
 * Prism of a convex outline from z = 0 to `top`, with its top edge finished by
 * a profile: 0 square, 1 chamfer, 2 round.
 */
export function profiledPrism(
  K: Kernel,
  s: Scope,
  outline: CrossSection,
  top: number,
  profile: number,
  size: number,
): Manifold {
  const p = Math.max(0, Math.min(size, top - 0.4));
  if (profile === 0 || p < 0.2) return s.t(s.t(outline.extrude(top + EPS)).translate([0, 0, -EPS / 2]));
  const levels: { inset: number; z: number }[] = [{ inset: 0, z: top - p }];
  const n = profile === 1 ? 1 : 12;
  for (let i = 1; i <= n; i++) {
    const a = (Math.PI / 2) * (i / n);
    levels.push(profile === 1 ? { inset: p, z: top } : { inset: p * (1 - Math.cos(a)), z: top - p + p * Math.sin(a) });
  }
  return loft(K, s, outline, levels);
}

export const isConvex = (cs: CrossSection) => {
  const a = cs.area();
  return a > 0 && cs.hull().area() - a < a * 1e-4;
};

/**
 * A prism of `outline` from z = 0 whose top is shaped by inward steps: at each
 * level the outline is inset by `inset` up to height `z` (insets grow with z).
 * Convex outlines get an exact hull; others are built as fine terraces.
 */
export function loft(K: Kernel, s: Scope, outline: CrossSection, levels: { inset: number; z: number }[]): Manifold {
  const { Manifold } = K;
  const at = (inset: number) => (inset > 0.001 ? s.t(outline.offset(-inset, 'Round', 2, 96)) : outline);
  if (isConvex(outline)) {
    const slab = (inset: number, z: number) => s.t(s.t(s.t(at(inset)).extrude(0.001)).translate([0, 0, z]));
    return s.t(Manifold.hull([slab(0, -EPS), ...levels.map((l, i) => slab(l.inset, l.z - (i === levels.length - 1 ? 0.001 : 0)))]));
  }
  // Densify so terraces stay thinner than a print layer.
  const dense: { inset: number; z: number }[] = [levels[0]];
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1],
      b = levels[i];
    const k = Math.max(1, Math.ceil((b.z - a.z) / 0.25));
    for (let j = 1; j <= k; j++) dense.push({ inset: a.inset + ((b.inset - a.inset) * j) / k, z: a.z + ((b.z - a.z) * j) / k });
  }
  const parts: Manifold[] = [s.t(s.t(at(0).extrude(dense[0].z + EPS)).translate([0, 0, -EPS]))];
  for (let i = 1; i < dense.length; i++) {
    const z0 = dense[i - 1].z,
      z1 = dense[i].z;
    if (z1 - z0 < 1e-4) continue;
    parts.push(s.t(s.t(at(dense[i].inset).extrude(z1 - z0 + 0.002)).translate([0, 0, z0 - 0.001])));
  }
  return s.t(Manifold.union(parts));
}

type Builder = (c: FrameCtx) => Manifold;

export const FRAME_BUILDERS: Record<string, Builder> = {
  classic: ({ K, s, outer, width, frontZ, p }) =>
    profiledPrism(K, s, outer, frontZ, p.profile ?? 2, Math.min(p.size ?? 4, width - 1)),

  stepped: ({ K, s, outer, width, frontZ, p }) => {
    const stepW = width * (1 - (p.ratio ?? 50) / 100);
    const drop = Math.min(p.drop ?? 2, frontZ - 2);
    const r = Math.min(p.size ?? 1.5, drop, stepW - 0.5);
    const low = profiledPrism(K, s, outer, frontZ - drop, 2, r);
    const upperOutline = s.t(outer.offset(-stepW, 'Round', 2, 96));
    const high = profiledPrism(K, s, upperOutline, frontZ, 2, Math.min(p.size ?? 1.5, width - stepW - 1));
    return s.t(K.Manifold.union([low, high]));
  },

  groove: ({ K, s, outer, width, frontZ, p }) => {
    const g = Math.min(p.groove ?? 2.4, width - 3);
    const depth = Math.min(p.depth ?? 1.2, frontZ - 2);
    const base = profiledPrism(K, s, outer, frontZ, 2, Math.min(p.size ?? 3, (width - g) / 2 - 0.5));
    const ring = (w: number) =>
      s.t(s.t(outer.offset(-(width / 2 - w / 2), 'Round', 2, 96)).subtract(s.t(outer.offset(-(width / 2 + w / 2), 'Round', 2, 96))));
    const tools: Manifold[] = [];
    const steps = (p.shape ?? 1) === 1 ? 6 : 1;
    for (let k = 0; k < steps; k++) {
      const f = 1 - k / steps;
      const z = frontZ - depth * f;
      tools.push(s.t(s.t(ring(g * f).extrude(depth * f + 1)).translate([0, 0, z])));
    }
    return s.t(base.subtract(s.t(K.Manifold.union(tools))));
  },

  bevel: ({ K, s, outer, width, frontZ, p }) => {
    const drop = Math.min(p.drop ?? 4, frontZ - 1.5);
    const flat = Math.max(0.5, width * ((p.flat ?? 20) / 100));
    return loft(K, s, outer, [
      { inset: 0, z: frontZ - drop },
      { inset: width - flat, z: frontZ },
    ]);
  },

  bead: ({ K, s, outer, width, frontZ, p }) => {
    const b = Math.min(p.bead ?? 6, width - 2);
    const drop = Math.min(p.drop ?? 2, frontZ - 2);
    const body = profiledPrism(K, s, outer, frontZ, 2, b / 2);
    const lower = s.t(s.t(s.t(outer.offset(-b, 'Round', 2, 96)).extrude(drop + 1)).translate([0, 0, frontZ - drop]));
    return s.t(body.subtract(lower));
  },

  cove: ({ K, s, outer, width, frontZ, p }) => {
    const drop = Math.min(p.drop ?? 4, frontZ - 1.5);
    const rim = width * ((p.flat ?? 15) / 100);
    const run = Math.max(1, width - rim);
    let body = profiledPrism(K, s, outer, frontZ, 2, Math.min(1, rim / 2));
    // Concave quarter-circle, cut as thin terraces (finer than a print layer).
    const steps = 24;
    const cuts: Manifold[] = [];
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const inset = rim + run * (1 - Math.cos((u * Math.PI) / 2));
      const z = frontZ - drop * u;
      cuts.push(s.t(s.t(s.t(outer.offset(-inset, 'Round', 2, 96)).extrude(frontZ - z + 1)).translate([0, 0, z])));
    }
    body = s.t(body.subtract(s.t(K.Manifold.union(cuts))));
    return body;
  },
};

export function buildFrameStyle(c: FrameCtx & { style: string }): Manifold {
  return (FRAME_BUILDERS[c.style] ?? FRAME_BUILDERS.classic)(c);
}
