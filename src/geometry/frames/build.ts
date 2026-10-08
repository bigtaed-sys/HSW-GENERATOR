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
  const { Manifold } = K;
  const p = Math.max(0, Math.min(size, top - 0.4));
  if (profile === 0 || p < 0.2) return s.t(s.t(outline.extrude(top + EPS)).translate([0, 0, -EPS / 2]));
  const layer = (inset: number, z: number) =>
    s.t(s.t(s.t(inset > 0 ? s.t(outline.offset(-inset, 'Round', 2, 96)) : outline).extrude(0.001)).translate([0, 0, z]));
  const layers: Manifold[] = [layer(0, -EPS), layer(0, top - p)];
  if (profile === 1) layers.push(layer(p, top - 0.001));
  else
    for (let i = 1; i <= 8; i++) {
      const a = (Math.PI / 2) * (i / 8);
      layers.push(layer(p * (1 - Math.cos(a)), top - p + p * Math.sin(a) - (i === 8 ? 0.001 : 0)));
    }
  return s.t(Manifold.hull(layers));
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
    const slab = (cs: CrossSection, z0: number, z1: number) => s.t(s.t(cs.extrude(z1 - z0)).translate([0, 0, z0]));
    const top = s.t(outer.offset(-(width - flat), 'Round', 2, 96));
    return s.t(K.Manifold.hull([slab(outer, -EPS, frontZ - drop), slab(top, frontZ - 0.001, frontZ)]));
  },
};

export function buildFrameStyle(c: FrameCtx & { style: string }): Manifold {
  return (FRAME_BUILDERS[c.style] ?? FRAME_BUILDERS.classic)(c);
}
