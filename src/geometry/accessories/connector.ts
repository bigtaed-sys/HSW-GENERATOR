import { connectorOffsets } from '../connectors';
import { INSERT, PITCH_Y } from '../constants';
import { ccw, Scope, type Kernel, type Manifold } from '../kernel';
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

  // Neighbouring lips are tied only in the 1.1 mm gap between them: a bar along
  // their shared edge, plus a plate between the centres of three mutually
  // adjacent cells. Bores stay open, so the group still looks like separate cells.
  const top = L - 0.2;
  const adj = (a: Vec2, b: Vec2) => Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - PITCH_Y) < 0.5;
  const side = INSERT.lip / Math.sqrt(3); // lip hexagon edge length
  const gap = PITCH_Y - INSERT.lip;
  const centrePlate = (pts: Vec2[]) => s.t(s.t(new CS([ccw(pts)])).extrude(top));
  for (let i = 0; i < offs.length; i++)
    for (let j = i + 1; j < offs.length; j++) {
      if (!adj(offs[i], offs[j])) continue;
      const [ax, ay] = offs[i],
        [bx, by] = offs[j];
      const mx = (ax + bx) / 2,
        my = (ay + by) / 2;
      const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      // Bar across the gap (with 0.4 mm overlap into each lip), as long as the shared edge.
      const bar = s.t(s.t(s.t(Manifold.cube([gap + 0.8, side, top], false)).translate([-(gap + 0.8) / 2, -side / 2, 0])).rotate([0, 0, ang]));
      parts.push(s.t(bar.translate([mx, my, 0])));
      for (let k = j + 1; k < offs.length; k++)
        if (adj(offs[i], offs[k]) && adj(offs[j], offs[k])) parts.push(centrePlate([offs[i], offs[j], offs[k]]));
    }

  // Screw insert (after PStover's HSW connectors): plugged, with a counterbore
  // for the head, a rounded seat narrowing to the shaft, and a shallow
  // hexagonal groove around the lip top.
  const plug = s.t(s.t(s.t(new CS([hexagon(INSERT.bore + 0.4)])).extrude(L + 3.8)).translate([0, 0, -3.8]));
  parts.push(plug);
  let body = s.t(Manifold.union(parts));
  const r = screw.d / 2 + 0.2;
  const R = Math.max(5.05, screw.head / 2 + 0.6); // counterbore radius
  const bore = 3; // counterbore depth from the lip top
  const floor = L - bore;
  const shaft = s.t(s.t(Manifold.cylinder(INSERT.length + L + 4, r, r, 32)).translate([0, 0, -INSERT.length - 2]));
  const counterbore = s.t(s.t(Manifold.cylinder(bore + 1, R, R, 64)).translate([0, 0, floor]));
  // Rounded seat: a spherical-cap-like taper from just under the counterbore to the shaft.
  const seatTop = Math.min(R - 0.4, screw.head / 2 + 0.45);
  const seatDepth = Math.min(2.6, floor + 3.6);
  const seat = s.t(
    Manifold.hull(
      Array.from({ length: 7 }, (_, i) => {
        const t = i / 6;
        const rad = r + (seatTop - r) * Math.sqrt(1 - t * t);
        return s.t(s.t(Manifold.cylinder(0.01, rad, rad, 48)).translate([0, 0, floor - seatDepth * t]));
      }),
    ),
  );
  const ring = s.t(
    s.t(s.t(s.t(new CS([hexagon(18.5)])).subtract(s.t(new CS([hexagon(16.5)])))).extrude(1.3)).translate([0, 0, L - 0.3]),
  );
  body = s.t(body.subtract(s.t(Manifold.union([shaft, counterbore, seat, ring]))));
  // Open bores through every non-screw insert.
  const bores = offs
    .slice(1)
    .map(([x, y]) => s.t(s.t(s.t(new CS([hexagon(INSERT.bore, x, y)])).extrude(INSERT.length + L + 4)).translate([0, 0, -INSERT.length - 2])));
  if (bores.length) body = s.t(body.subtract(s.t(Manifold.union(bores))));
  return body;
}
