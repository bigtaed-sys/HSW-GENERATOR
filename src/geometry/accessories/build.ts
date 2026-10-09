import { INSERT, PITCH_X, PITCH_Y } from '../constants';
import { ccw, Scope, type Kernel, type Manifold } from '../kernel';
import { hexagon, type Vec2 } from '../lattice';
import { accessoryDef } from './defs';
import { buildConnector } from './connector';
import { connectorOffsets } from '../connectors';
import { pstoverConnector, pstoverInsert } from '../pstover';

// Local accessory frame: origin at the front face of the anchor cell centre,
// +Y up, +Z out of the wall. Inserts go into -Z.

/** A snap-fit insert that plugs into one HSW cell. */
export function insertPeg(K: Kernel, s: Scope, tol = 0): Manifold {
  const { Manifold, CrossSection: CS } = K;
  const lip = s.t(s.t(new CS([hexagon(INSERT.lip)])).extrude(INSERT.lipHeight));
  const body = s.t(s.t(s.t(new CS([hexagon(INSERT.body + tol)])).extrude(INSERT.length)).translate([0, 0, -INSERT.length]));
  const bore = s.t(s.t(s.t(new CS([hexagon(INSERT.bore)])).extrude(INSERT.length - 1.2)).translate([0, 0, -INSERT.length - 0.1]));
  // Slot so the two halves can flex while snapping in.
  const slot = s.t(Manifold.cube([INSERT.body + 2, 1.6, 6.2], true).translate([0, 0, -INSERT.length + 3]));
  s.t(slot);
  const y0 = (INSERT.body + tol) / 2;
  const ridge = (sign: number) =>
    s.t(
      Manifold.hull(
        [-4, 4].flatMap((x) => [
          [x, sign * (y0 - 0.3), -8.25],
          [x, sign * (y0 + INSERT.snap), -8.25],
          [x, sign * (y0 + INSERT.snap), -8.6],
          [x, sign * y0, -9.9],
          [x, sign * (y0 - 0.3), -9.9],
        ]) as [number, number, number][],
      ),
    );
  const shell = s.t(s.t(s.t(body.subtract(bore)).subtract(slot)).add(lip));
  return s.t(Manifold.union([shell, ridge(1), ridge(-1)]));
}

const pegOffset = ([dc, dr]: [number, number]): Vec2 => [dc * PITCH_X, dr * PITCH_Y];

/** Extrude a profile drawn in the (z, y) plane across X, centred on x = cx. */
function sideProfile(K: Kernel, s: Scope, pts: Vec2[], width: number, cx = 0, round = 0): Manifold {
  let cs = s.t(new K.CrossSection([ccw(pts)]));
  if (round > 0) cs = s.t(s.t(cs.offset(-round, 'Round', 2, 24)).offset(round, 'Round', 2, 24));
  const m = s.t(s.t(cs.extrude(width)).translate([0, 0, -width / 2]));
  return s.t(s.t(m.rotate([0, -90, 0])).translate([cx, 0, 0]));
}

function roundedBox(K: Kernel, s: Scope, w: number, h: number, d: number, r: number): Manifold {
  // Box with rounded vertical edges as seen from the front, w along X, h along Y, d along Z (from z=0).
  const rr = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  let cs = s.t(K.CrossSection.square([w, h], true));
  if (rr > 0.05) cs = s.t(s.t(cs.offset(-rr, 'Miter')).offset(rr, 'Round', 2, 24));
  return s.t(cs.extrude(d));
}

const rod = (K: Kernel, s: Scope, d: number, len: number, seg = 32) =>
  s.t(K.Manifold.cylinder(len, d / 2, d / 2, seg));

export function buildAccessory(K: Kernel, s: Scope, type: string, p: Record<string, number>, tol = 0): Manifold {
  const { Manifold } = K;
  if (type === 'connector')
    return pstoverConnector(K, s, connectorOffsets(p), tol) ?? buildConnector(K, s, p, tol, { d: p.screw ?? 4, head: p.head ?? 8 });
  const def = accessoryDef(type);
  if (!def) return s.t(Manifold.cube(1));
  const pegs = def.pegs(p).map(pegOffset);
  // PStover's standard insert (CC BY-NC 4.0): proven fit on HSW cells.
  // Its bore is open at the top, so accessories close it with a lid the body sits on.
  const lid = s.t(s.t(s.t(new K.CrossSection([hexagon(INSERT.lip - 0.4)])).extrude(1.2)).translate([0, 0, INSERT.lipHeight - 1.2]));
  const insert = s.t(pstoverInsert(K, s, tol).add(lid));
  const parts: Manifold[] = pegs.map(([x, y]) => s.t(insert.translate([x, y, 0])));
  const L = INSERT.lipHeight;
  const spanX = pegs.length ? pegs[pegs.length - 1][0] : 0;
  const midX = spanX / 2;

  switch (type) {
    case 'hook': {
      const t = p.thickness;
      const len = p.length;
      const tip = p.tip;
      const pts: Vec2[] = [
        [0, -t / 2 - 4],
        [len, -t / 2 - 4],
        [len, tip + t / 2 - 4],
        [len - t, tip + t / 2 - 4],
        [len - t, t / 2 - 4],
        [0, t / 2 - 4],
      ];
      parts.push(sideProfile(K, s, pts, p.width, 0, Math.min(t / 2 - 0.2, 2)));
      parts.push(s.t(roundedBox(K, s, p.width + 4, 18, L + 1, 3)));
      break;
    }
    case 'peg':
    case 'plier': {
      const d = p.diameter;
      const xs = type === 'plier' ? [-(p.gap + d) / 2, (p.gap + d) / 2] : [0];
      for (const x of xs) {
        let r = rod(K, s, d, p.length);
        if (type === 'peg' && p.knob > 0) {
          const k = s.t(Manifold.cylinder(Math.min(4, p.knob + 2), d / 2 + p.knob, d / 2 + p.knob * 0.6, 32));
          r = s.t(r.add(s.t(k.translate([0, 0, p.length - Math.min(4, p.knob + 2)]))));
        }
        r = s.t(s.t(r.rotate([-p.angle, 0, 0])).translate([x, 0, L - 0.5]));
        parts.push(r);
      }
      if (type === 'plier') parts.push(s.t(roundedBox(K, s, p.gap + 2 * d + 6, 16, L + 1, 3)));
      break;
    }
    case 'shelf': {
      const w = Math.max(p.width, spanX + 26);
      const t = p.thickness;
      const backH = 34;
      const top = 10;
      const back = s.t(s.t(roundedBox(K, s, w, backH, t, 3)).translate([midX, top - backH / 2, L - 0.01]));
      const z0 = L;
      const boardY = top - backH;
      const board = s.t(s.t(Manifold.cube([w, t, p.depth])).translate([midX - w / 2, boardY, z0]));
      parts.push(back, board);
      if (p.lip > 0)
        parts.push(s.t(s.t(Manifold.cube([w, p.lip + t, t])).translate([midX - w / 2, boardY, z0 + p.depth - t])));
      // Gussets under the board at both ends.
      const g = Math.min(p.depth - t, 60);
      for (const x of [midX - w / 2 + 2 + t / 2, midX + w / 2 - 2 - t / 2]) {
        parts.push(
          sideProfile(
            K,
            s,
            [
              [z0, boardY],
              [z0 + g, boardY],
              [z0, boardY - g * 0.7],
            ],
            t,
            x,
          ),
        );
      }
      break;
    }
    case 'bin': {
      const w = Math.max(p.width, spanX + 26);
      const h = p.height,
        d = p.depth,
        wl = p.wall;
      const top = 10;
      const outer = s.t(s.t(roundedBox(K, s, w, h, d + wl, 4)).translate([midX, top - h / 2, L - 0.01]));
      const inner = s.t(s.t(roundedBox(K, s, w - 2 * wl, h + 10, d - wl, 4 - wl)).translate([midX, top - h / 2 + wl + 5, L + wl]));
      let box = s.t(outer.subtract(inner));
      // Lower front wall for easy access.
      const fh = (h * p.front) / 100;
      const scoop = s.t(Manifold.cube([w - 2 * wl, h, wl * 3]).translate([midX - (w - 2 * wl) / 2, top - h + fh, L + d - wl * 2]));
      box = s.t(box.subtract(s.t(scoop)));
      parts.push(box);
      break;
    }
    case 'rack': {
      const w = Math.max(p.width, spanX + 26, p.holes * (p.hole + 4) + 6);
      const t = 6;
      const top = 6;
      const back = s.t(s.t(roundedBox(K, s, w, 26, t, 3)).translate([midX, top - 13, L - 0.01]));
      const hd = Math.min(p.hole, p.depth - 8);
      let bar = s.t(Manifold.cube([w, t, p.depth]).translate([midX - w / 2, top - t, L - 0.01]));
      const pitch = (w - 6) / p.holes;
      for (let i = 0; i < p.holes; i++) {
        const hx = midX - w / 2 + 3 + pitch * (i + 0.5);
        const hole = s.t(s.t(rod(K, s, hd, t + 2).rotate([90, 0, 0])).translate([hx, top + 1, L + 4 + hd / 2 + (p.depth - 8 - hd) / 2]));
        bar = s.t(bar.subtract(hole));
      }
      parts.push(back, bar);
      break;
    }
    case 'ring': {
      const ri = p.diameter / 2,
        ro = ri + p.wall;
      const h = p.height;
      const top = 8;
      const cz = L + 3 + ro;
      let ringM = s.t(s.t(Manifold.cylinder(h, ro, ro, 64)).subtract(s.t(s.t(Manifold.cylinder(h + 2, ri, ri, 64)).translate([0, 0, -1]))));
      if (p.floor >= 0.5) ringM = s.t(ringM.add(s.t(Manifold.cylinder(1.6, ro, ro, 64))));
      ringM = s.t(s.t(ringM.rotate([90, 0, 0])).translate([midX, top, cz]));
      const w = Math.max(spanX + 24, 20);
      const back = s.t(s.t(roundedBox(K, s, w, h, 4, 3)).translate([midX, top - h / 2, L - 0.01]));
      const bridge = s.t(Manifold.cube([Math.min(ro * 1.4, w), h, cz - L - ro + 2]).translate([midX - Math.min(ro * 1.4, w) / 2, top - h, L]));
      s.t(bridge);
      parts.push(ringM, back, bridge);
      break;
    }
    case 'label': {
      const w = Math.max(p.width, spanX + 26);
      parts.push(s.t(s.t(roundedBox(K, s, w, Math.max(p.height, 24), p.thickness, 3)).translate([midX, 0, L - 0.01])));
      break;
    }
    case 'cap': {
      if (p.dome > 0) {
        const top = s.t(s.t(new K.CrossSection([hexagon(INSERT.lip - 2 * p.dome)])).extrude(0.01));
        const base = s.t(s.t(new K.CrossSection([hexagon(INSERT.lip)])).extrude(0.01));
        parts.push(s.t(Manifold.hull([s.t(base.translate([0, 0, L - 0.6])), s.t(top.translate([0, 0, L + p.dome]))])));
      }
      break;
    }
  }
  return s.t(Manifold.union(parts));
}
