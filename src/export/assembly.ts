import { HOLE_FRONT } from '../geometry/constants';
import { cellCenter, hexagon, type Vec2 } from '../geometry/lattice';
import type { AccessoryShape, Layout } from '../geometry/layoutTypes';
import type { Project } from '../model/types';

const pathOf = (polys: Vec2[][]) =>
  polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join('L') + 'Z').join('');

/** A printable assembly sheet: every piece with its label, at 1:1 millimetre scale. */
export function assemblySvg(
  project: Project,
  layout: Layout,
  shapes: Record<string, AccessoryShape>,
  shapeKey: (t: string, p: Record<string, number>) => string,
  title: string,
): string {
  const [x0, y0, x1, y1] = layout.pieces.reduce(
    (b, p) => [Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const pad = 40;
  const W = x1 - x0 + 2 * pad;
  const H = y1 - y0 + 2 * pad + 40;
  const holes = layout.cells
    .filter((c) => c.kind !== 'solid')
    .map((c) => (c.poly ? pathOf(c.poly) : pathOf([hexagon(HOLE_FRONT, c.x, c.y)])))
    .join('');
  const mounts = layout.cells
    .filter((c) => c.kind === 'mount')
    .map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${(-c.y).toFixed(1)}" r="${project.mount.screwDiameter / 2}"/>`)
    .join('');
  const screws = layout.pieces
    .flatMap((p) => p.screws)
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${(-y).toFixed(1)}" r="${project.mount.screwDiameter / 2}"/>`)
    .join('');
  const acc = project.accessories
    .map((a) => {
      const s = shapes[shapeKey(a.type, a.params)];
      if (!s) return '';
      const [x, y] = cellCenter(a.c, a.r, project.grid);
      return `<path transform="translate(${x.toFixed(1)},${(-y).toFixed(1)})" d="${pathOf(s.outline)}" fill="${a.color}" fill-opacity="0.35" stroke="${a.color}"/>`;
    })
    .join('');
  const pieces = layout.pieces
    .map((p) => {
      const [cx, cy] = p.anchor;
      const fill = p.kind === 'frame' ? '#f3e6d6' : '#f4f4f4';
      return `<path d="${pathOf(p.polys)}" fill="${fill}" fill-rule="evenodd" stroke="#222" stroke-width="0.8"/>
<text x="${cx.toFixed(1)}" y="${(-cy + 6).toFixed(1)}" font-size="18" font-weight="700" text-anchor="middle" fill="#d0800f">${p.label}</text>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}mm" height="${H.toFixed(0)}mm" viewBox="${(x0 - pad).toFixed(1)} ${(-y1 - pad - 40).toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" font-family="Inter, Arial, sans-serif">
<rect x="${(x0 - pad).toFixed(1)}" y="${(-y1 - pad - 40).toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#fff"/>
<text x="${(x0).toFixed(1)}" y="${(-y1 - pad + 4).toFixed(1)}" font-size="20" font-weight="700" fill="#111">${title.replace(/[<&>]/g, '')}</text>
<text x="${(x0).toFixed(1)}" y="${(-y1 - pad + 24).toFixed(1)}" font-size="11" fill="#666">${layout.stats.width.toFixed(0)} × ${layout.stats.height.toFixed(0)} mm · ${layout.stats.panels} + ${layout.stats.framePieces}</text>
${pieces}
<path d="${holes}" fill="#bbb" fill-rule="nonzero"/>
<g fill="#222">${mounts}${screws}</g>
${acc}
</svg>`;
}
