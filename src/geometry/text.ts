// Minimal single-stroke font for engraving piece labels (A1, F3, …).
// Glyphs are polylines in a 4 × 6 box; strokes get a round-capped width.

import { ccw, Scope, type CrossSection, type Kernel } from './kernel';
import type { Vec2 } from './lattice';

type Glyph = Vec2[][];

const box: Glyph = [
  [
    [0, 0],
    [4, 0],
    [4, 6],
    [0, 6],
    [0, 0],
  ],
];

const P = (...pts: number[]): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  return out;
};

const GLYPHS: Record<string, Glyph> = {
  '0': [...box, P(0, 0, 4, 6)],
  '1': [P(1, 5, 2, 6, 2, 0), P(1, 0, 3, 0)],
  '2': [P(0, 6, 4, 6, 4, 3, 0, 3, 0, 0, 4, 0)],
  '3': [P(0, 6, 4, 6, 4, 0, 0, 0), P(1, 3, 4, 3)],
  '4': [P(0, 6, 0, 3, 4, 3), P(3, 6, 3, 0)],
  '5': [P(4, 6, 0, 6, 0, 3, 4, 3, 4, 0, 0, 0)],
  '6': [P(4, 6, 0, 6, 0, 0, 4, 0, 4, 3, 0, 3)],
  '7': [P(0, 6, 4, 6, 1, 0)],
  '8': [...box, P(0, 3, 4, 3)],
  '9': [P(0, 0, 4, 0, 4, 6, 0, 6, 0, 3, 4, 3)],
  A: [P(0, 0, 0, 4, 2, 6, 4, 4, 4, 0), P(0, 3, 4, 3)],
  B: [P(0, 0, 0, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3), P(3, 3, 4, 2, 4, 1, 3, 0, 0, 0)],
  C: [P(4, 6, 0, 6, 0, 0, 4, 0)],
  D: [P(0, 0, 0, 6, 2, 6, 4, 4, 4, 2, 2, 0, 0, 0)],
  E: [P(4, 6, 0, 6, 0, 0, 4, 0), P(0, 3, 3, 3)],
  F: [P(4, 6, 0, 6, 0, 0), P(0, 3, 3, 3)],
  G: [P(4, 6, 0, 6, 0, 0, 4, 0, 4, 3, 2, 3)],
  H: [P(0, 0, 0, 6), P(4, 0, 4, 6), P(0, 3, 4, 3)],
  I: [P(1, 6, 3, 6), P(2, 6, 2, 0), P(1, 0, 3, 0)],
  J: [P(4, 6, 4, 0, 0, 0, 0, 2)],
  K: [P(0, 0, 0, 6), P(4, 6, 0, 3, 4, 0)],
  L: [P(0, 6, 0, 0, 4, 0)],
  M: [P(0, 0, 0, 6, 2, 3, 4, 6, 4, 0)],
  N: [P(0, 0, 0, 6, 4, 0, 4, 6)],
  O: box,
  P: [P(0, 0, 0, 6, 4, 6, 4, 3, 0, 3)],
  Q: [...box, P(2, 2, 4, 0)],
  R: [P(0, 0, 0, 6, 4, 6, 4, 3, 0, 3), P(1, 3, 4, 0)],
  S: [P(4, 6, 0, 6, 0, 3, 4, 3, 4, 0, 0, 0)],
  T: [P(0, 6, 4, 6), P(2, 6, 2, 0)],
  U: [P(0, 6, 0, 0, 4, 0, 4, 6)],
  V: [P(0, 6, 2, 0, 4, 6)],
  W: [P(0, 6, 1, 0, 2, 3, 3, 0, 4, 6)],
  X: [P(0, 0, 4, 6), P(0, 6, 4, 0)],
  Y: [P(0, 6, 2, 3, 4, 6), P(2, 3, 2, 0)],
  Z: [P(0, 6, 4, 6, 0, 0, 4, 0)],
  '-': [P(1, 3, 3, 3)],
};

const ADVANCE = 6;

/** Width of a label in mm for a given cap height. */
export const textWidth = (text: string, height: number) => ((text.length * ADVANCE - 2) * height) / 6;

/**
 * Text outline centred on the origin, reading left to right.
 * `mirror` flips it so it reads correctly when seen from behind (for the back face).
 */
export function textOutline(
  K: Kernel,
  s: Scope,
  text: string,
  height: number,
  stroke: number,
  opts: { mirror?: boolean; angle?: number } = {},
): CrossSection {
  const k = height / 6;
  const r = stroke / 2;
  const w = textWidth(text, height);
  const shapes: Vec2[][] = [];
  const seg = 10;
  const disc = (x: number, y: number) =>
    Array.from({ length: seg }, (_, i) => [x + r * Math.cos((2 * Math.PI * i) / seg), y + r * Math.sin((2 * Math.PI * i) / seg)] as Vec2);
  [...text.toUpperCase()].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) return;
    const ox = i * ADVANCE * k - w / 2;
    for (const line of g) {
      const pts = line.map(([x, y]) => [ox + x * k, y * k - height / 2] as Vec2);
      for (let j = 0; j < pts.length; j++) {
        shapes.push(disc(...pts[j]));
        if (j === 0) continue;
        const [x0, y0] = pts[j - 1];
        const [x1, y1] = pts[j];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (-(y1 - y0) / len) * r,
          ny = ((x1 - x0) / len) * r;
        shapes.push(
          ccw([
            [x0 + nx, y0 + ny],
            [x1 + nx, y1 + ny],
            [x1 - nx, y1 - ny],
            [x0 - nx, y0 - ny],
          ]),
        );
      }
    }
  });
  let cs = s.t(new K.CrossSection(shapes.map((p) => ccw(p)), 'Positive'));
  if (opts.mirror) cs = s.t(cs.mirror([1, 0]));
  if (opts.angle) cs = s.t(cs.rotate(opts.angle));
  return cs;
}
