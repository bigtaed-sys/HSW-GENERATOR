import { beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { computeLayout, splitEven } from '../layout';
import { defaultProject } from '../../model/defaults';
import type { Kernel } from '../kernel';
import { signedArea } from '../kernel';

let K: Kernel;
beforeAll(async () => {
  K = await Module();
  K.setup();
});

describe('splitEven', () => {
  it('balances groups', () => {
    expect(splitEven([1, 2, 3, 4, 5, 6, 7], 3).map((g) => g.length)).toEqual([2, 3, 2]);
  });
});

describe('layout', () => {
  it('splits default wall into printable panels and frame pieces', () => {
    const p = defaultProject();
    const t = performance.now();
    const L = computeLayout(K, p);
    const ms = performance.now() - t;
    const { stats, pieces, warnings } = L.layout;
    console.log(ms.toFixed(0), 'ms', stats, warnings, pieces.map((x) => `${x.label}:${x.printSize.map((v) => v.toFixed(0))}@${x.printAngle}`).join(' '));
    expect(warnings).toEqual([]);
    expect(stats.panels).toBeGreaterThan(4);
    expect(stats.framePieces).toBeGreaterThan(2);
    for (const pc of pieces) expect(pc.printAngle).not.toBeNull();
    // Panels + frame cover the outline exactly.
    const area = (polys: [number, number][][]) => polys.reduce((a, q) => a + signedArea(q), 0);
    const total = pieces.reduce((a, pc) => a + area(pc.polys), 0);
    expect(total).toBeCloseTo(area(L.layout.outer), -1);
    L.scope.free();
  });

  it('handles other shapes and partial mode', () => {
    for (const shape of ['hexagon', 'ellipse', 'honeycomb'] as const) {
      const p = defaultProject();
      p.wall.shape = shape;
      p.grid.mode = 'partial';
      p.cutouts.push({ id: 'a', x: 100, y: 50, w: 80, h: 120, r: 8, rim: 4, chamfer: 1 });
      const L = computeLayout(K, p);
      console.log(shape, L.layout.stats, L.layout.warnings);
      expect(L.layout.warnings).toEqual([]);
      L.scope.free();
    }
  });
});
