import { beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { computeLayout } from '../layout';
import { buildPiece, prepareTools } from '../build';
import { buildAccessory } from '../accessories/build';
import { ACCESSORIES, defaultParams } from '../accessories/defs';
import { defaultProject } from '../../model/defaults';
import { Scope, type Kernel } from '../kernel';

let K: Kernel;
beforeAll(async () => {
  K = await Module();
  K.setup();
});

describe('build', () => {
  it('builds every piece of the default wall as a valid solid', () => {
    const p = defaultProject();
    p.cutouts.push({ id: 'a', x: 30, y: -40, w: 86, h: 86, r: 10, rim: 4, chamfer: 1 });
    p.grid.mode = 'partial';
    const L = computeLayout(K, p);
    const s = new Scope();
    const cache = prepareTools(K, L, p, s);
    const t = performance.now();
    let tris = 0;
    for (const piece of L.layout.pieces) {
      const m = buildPiece(K, L, piece.id, cache)!;
      expect(m.status()).toBe('NoError');
      expect(m.volume()).toBeGreaterThan(1000);
      expect(m.decompose().length).toBe(1);
      tris += m.numTri();
      m.delete();
    }
    console.log('built', L.layout.pieces.length, 'pieces in', (performance.now() - t).toFixed(0), 'ms, tris', tris);
    s.free();
    L.scope.free();
  });

  it('builds all accessories', () => {
    for (const def of ACCESSORIES) {
      const s = new Scope();
      const m = buildAccessory(K, s, def.type, defaultParams(def.type));
      expect(m.status()).toBe('NoError');
      expect(m.volume()).toBeGreaterThan(500);
      const bb = m.boundingBox();
      console.log(def.type, m.decompose().length, bb.min.map(Math.round), bb.max.map(Math.round));
      s.free();
    }
  });
});
