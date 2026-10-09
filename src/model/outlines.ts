import type { Text } from '../geometry/params';

type P = [number, number];

/** Outline templates in fractions of width/height, centred on the origin, counter-clockwise. */
export const OUTLINE_PRESETS: { id: string; name: Text; pts: P[] }[] = [
  { id: 'rect', name: { ru: 'Прямоугольник', en: 'Rectangle' }, pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
  { id: 'L', name: { ru: 'Г-образная', en: 'L shape' }, pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0], [0, 0], [0, 0.5], [-0.5, 0.5]] },
  {
    id: 'U',
    name: { ru: 'П-образная', en: 'U shape' },
    pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [0.2, 0.5], [0.2, -0.1], [-0.2, -0.1], [-0.2, 0.5], [-0.5, 0.5]],
  },
  {
    id: 'T',
    name: { ru: 'Т-образная', en: 'T shape' },
    pts: [[-0.15, -0.5], [0.15, -0.5], [0.15, 0.1], [0.5, 0.1], [0.5, 0.5], [-0.5, 0.5], [-0.5, 0.1], [-0.15, 0.1]],
  },
  { id: 'trap', name: { ru: 'Трапеция', en: 'Trapezoid' }, pts: [[-0.5, -0.5], [0.5, -0.5], [0.3, 0.5], [-0.3, 0.5]] },
  {
    id: 'stairs',
    name: { ru: 'Лесенка', en: 'Stairs' },
    pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [0.17, 0.5], [0.17, 0.17], [-0.17, 0.17], [-0.17, -0.17], [-0.5, -0.17]],
  },
  {
    id: 'arch',
    name: { ru: 'Арка', en: 'Arch' },
    pts: [
      [-0.5, -0.5],
      [0.5, -0.5],
      ...Array.from({ length: 17 }, (_, i) => {
        const a = (Math.PI * i) / 16;
        return [0.5 * Math.cos(a), 0.1 + 0.4 * Math.sin(a)] as P;
      }),
    ],
  },
];

export const presetPoints = (id: string, w: number, h: number): P[] =>
  (OUTLINE_PRESETS.find((p) => p.id === id) ?? OUTLINE_PRESETS[0]).pts.map(([x, y]) => [Math.round(x * w), Math.round(y * h)]);

export function boundsOf(pts: P[]) {
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** Scale an outline to a new bounding size, keeping it centred where it was. */
export function scalePoints(pts: P[], w: number, h: number): P[] {
  const b = boundsOf(pts);
  const cx = (b.x0 + b.x1) / 2,
    cy = (b.y0 + b.y1) / 2;
  const kx = w / Math.max(1, b.x1 - b.x0),
    ky = h / Math.max(1, b.y1 - b.y0);
  return pts.map(([x, y]) => [Math.round(cx + (x - cx) * kx), Math.round(cy + (y - cy) * ky)]);
}
