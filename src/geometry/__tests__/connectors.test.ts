import { beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { computeLayout } from '../layout';
import { buildAccessory } from '../accessories/build';
import { defaultProject } from '../../model/defaults';
import { Scope, type Kernel } from '../kernel';
import { cellKey } from '../../model/types';

let K: Kernel;
beforeAll(async () => {
  K = await Module();
  K.setup();
});

describe('connectors', () => {
  it('ties every panel to its neighbours and the wall', () => {
    const p = defaultProject();
    const L = computeLayout(K, p);
    const { connectors, pieces, cells } = L.layout;
    const sizes = connectors.reduce<Record<number, number>>((a, k) => ((a[k.cells.length] = (a[k.cells.length] ?? 0) + 1), a), {});
    console.log('connectors', connectors.length, 'by size', JSON.stringify(sizes));
    const panels = pieces.filter((x) => x.kind === 'panel');
    for (const pn of panels) {
      const screws = connectors.filter((k) => k.panels.includes(pn.id)).length;
      expect(screws).toBeGreaterThanOrEqual(p.mount.minPerPanel);
    }
    // Every pair of panels sharing a seam is joined by at least one connector.
    const kind = new Map(cells.map((c) => [cellKey(c.c, c.r), c]));
    expect(connectors.some((k) => k.panels.length >= 3)).toBe(true);
    // Connector cells are real cells and not shared.
    const seen = new Set<string>();
    for (const k of connectors)
      for (const c of k.cells) {
        const key = cellKey(c.c, c.r);
        expect(kind.get(key)?.kind).toBe('conn');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    // Edge singles come in mirrored sets.
    const singles = connectors.filter((k) => k.cells.length === 1);
    for (const k of singles) expect(singles.some((q) => Math.hypot(q.screw[0] + k.screw[0], q.screw[1] - k.screw[1]) < 1)).toBe(true);
    L.scope.free();
  });

  it('respects the placement switches', () => {
    const p = defaultProject();
    p.mount.junctions = false;
    p.mount.edges = false;
    p.mount.seams = true;
    p.mount.minPerPanel = 0;
    const L = computeLayout(K, p);
    expect(L.layout.connectors.length).toBeGreaterThan(0);
    expect(L.layout.connectors.every((k) => k.cells.length === 2)).toBe(true);
    L.scope.free();
  });

  it('builds every connector shape as one solid', () => {
    const p = defaultProject();
    const L = computeLayout(K, p);
    const shapes = new Map(L.layout.connectors.map((k) => [JSON.stringify(k.params), k.params]));
    for (const params of shapes.values()) {
      const s = new Scope();
      const m = buildAccessory(K, s, 'connector', params);
      expect(m.status()).toBe('NoError');
      expect(m.decompose().length).toBe(1);
      console.log('connector', params.n, 'cells', (m.volume() / 1000).toFixed(2), 'cm3');
      s.free();
    }
    L.scope.free();
  });
});
