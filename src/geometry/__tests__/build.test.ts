import { beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { computeLayout } from '../layout';
import { buildPiece, prepareTools } from '../build';
import { buildAccessory } from '../accessories/build';
import { ACCESSORIES, defaultParams } from '../accessories/defs';
import { defaultProject } from '../../model/defaults';
import { FRAME_STYLES } from '../frames/styles';
import { makeTestKit } from '../../model/testKit';
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

  it('builds every frame style with lap joints and a lip', () => {
    for (const style of FRAME_STYLES) {
      const p = defaultProject();
      p.frame.style = style.id;
      p.frame.width = 24;
      p.frame.proud = 3;
      const L = computeLayout(K, p);
      expect(L.layout.warnings).toEqual([]);
      const s = new Scope();
      const cache = prepareTools(K, L, p, s);
      const frames = L.layout.pieces.filter((x) => x.kind === 'frame');
      let vol = 0;
      for (const piece of frames) {
        const m = buildPiece(K, L, piece.id, cache)!;
        expect(m.status()).toBe('NoError');
        expect(m.decompose().length).toBe(1);
        vol += m.volume();
        // Lap ends reach past the cut, so the piece is taller than half the frame everywhere.
        expect(m.boundingBox().max[2]).toBeCloseTo(L.frontZ, 1);
        m.delete();
      }
      console.log(style.id, frames.length, 'parts', (vol / 1000).toFixed(1), 'cm3, screws', frames.reduce((a, f) => a + f.screws.length, 0));
      s.free();
      L.scope.free();
    }
  });

  it('makes a small test kit with one panel and a jointed frame', () => {
    const p = makeTestKit(defaultProject());
    const L = computeLayout(K, p);
    const { stats, warnings } = L.layout;
    console.log('kit', stats.panels, 'panel', stats.framePieces, 'frame parts', stats.holes, 'holes', p.wall.width.toFixed(0), 'x', p.wall.height.toFixed(0));
    expect(warnings).toEqual([]);
    expect(stats.panels).toBe(1);
    expect(stats.framePieces).toBeGreaterThanOrEqual(3);
    const s = new Scope();
    const cache = prepareTools(K, L, p, s);
    for (const piece of L.layout.pieces) {
      const m = buildPiece(K, L, piece.id, cache)!;
      expect(m.decompose().length).toBe(1);
      m.delete();
    }
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
