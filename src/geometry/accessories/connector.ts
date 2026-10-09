import { connectorOffsets } from '../connectors';
import { INSERT, PITCH_Y } from '../constants';
import { Scope, type Kernel, type Manifold } from '../kernel';
import { hexagon, type Vec2 } from '../lattice';
import { insertPeg } from './build';

/**
 * A connector group in its canonical frame: the screw cell at the origin, the
 * other inserts at the given offsets. Lips of neighbouring inserts are bridged
 * into one plate; the screw insert is plugged and has a countersunk hole.
 */
export function buildConnector(
  K: Kernel,
  s: Scope,
  params: Record<string, number>,
  tol = 0,
  screw = { d: 4, head: 8 },
): Manifold {
  const { Manifold, CrossSection: CS } = K;
  const offs = connectorOffsets(params);
  const L = INSERT.lipHeight;
  const peg = insertPeg(K, s, tol);
  const parts: Manifold[] = offs.map(([x, y]) => s.t(peg.translate([x, y, 0])));

  // Bridge every pair (and triangle) of neighbouring lips with the hull of their hexagons.
  const lip = (p: Vec2) => s.t(s.t(new CS([hexagon(INSERT.lip, p[0], p[1])])).extrude(L));
  const adj = (a: Vec2, b: Vec2) => Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - PITCH_Y) < 0.5;
  for (let i = 0; i < offs.length; i++)
    for (let j = i + 1; j < offs.length; j++) {
      if (!adj(offs[i], offs[j])) continue;
      parts.push(s.t(Manifold.hull([lip(offs[i]), lip(offs[j])])));
      for (let k = j + 1; k < offs.length; k++)
        if (adj(offs[i], offs[k]) && adj(offs[j], offs[k])) parts.push(s.t(Manifold.hull([lip(offs[i]), lip(offs[j]), lip(offs[k])])));
    }

  // Screw insert: solid plug from below the lip to the top, countersunk hole through.
  const plug = s.t(s.t(s.t(new CS([hexagon(INSERT.bore + 0.4)])).extrude(L + 3)).translate([0, 0, -3]));
  parts.push(plug);
  let body = s.t(Manifold.union(parts));
  const r = screw.d / 2 + 0.2;
  const R = screw.head / 2 + 0.3;
  const sink = Math.max(0.5, R - r);
  const shaft = s.t(s.t(Manifold.cylinder(INSERT.length + L + 4, r, r, 32)).translate([0, 0, -INSERT.length - 2]));
  const cone = s.t(s.t(Manifold.cylinder(sink + 0.01, r, R, 48)).translate([0, 0, L - sink]));
  const top = s.t(s.t(Manifold.cylinder(1, R, R, 48)).translate([0, 0, L - 0.001]));
  body = s.t(body.subtract(s.t(Manifold.union([shaft, cone, top]))));
  return body;
}
