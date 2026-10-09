import { beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { computeLayout } from '../layout';
import { buildPiece, prepareTools } from '../build';
import { buildAccessory } from '../accessories/build';
import { ACCESSORIES, defaultParams } from '../accessories/defs';
import { defaultProject } from '../../model/defaults';
import { FRAME_STYLES } from '../frames/styles';
import { makeTestKit } from '../../model/testKit';
import { FRAME_PRESETS } from '../../model/framePresets';
import { Scope, signedArea, type Kernel } from '../kernel';

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

  it('builds the frame presets (honeycomb relief, round inner edge) as single solids', () => {
    const litSeparate = { id: 'lit-separate', name: '', apply: (f: ReturnType<typeof defaultProject>['frame']) => {
      FRAME_PRESETS.find((x) => x.id === 'hex-lit')!.apply(f);
      Object.assign(f, { mode: 'separate', width: 40 });
    } };
    for (const preset of [...FRAME_PRESETS, litSeparate]) {
      const p = defaultProject();
      p.wall.width = 700;
      p.wall.height = 500;
      preset.apply(p.frame);
      const L = computeLayout(K, p);
      if (p.frame.style === 'cells' || p.frame.style === 'lit') expect(L.layout.pattern?.length ?? 0).toBeGreaterThan(p.frame.style === 'lit' ? 0 : 50);
      const s = new Scope();
      const cache = prepareTools(K, L, p, s);
      const t = performance.now();
      let vol = 0;
      for (const piece of L.layout.pieces) {
        if (piece.kind === 'panel' && !piece.framePolys) continue;
        const m = buildPiece(K, L, piece.id, cache)!;
        expect(m.status()).toBe('NoError');
        expect(m.decompose().length).toBe(1);
        vol += m.volume();
        m.delete();
      }
      if (preset.id === 'lit-separate') {
        // Cut along the grooves, no laps: one patch per seam.
        const frames = L.layout.pieces.filter((x) => x.kind === 'frame').length;
        expect(frames).toBeGreaterThan(1);
        expect(L.plates.length).toBe(frames);
        for (const pl of L.plates) expect(pl.decompose().length).toBe(1);
      }
      console.log(preset.id, L.layout.pattern?.length ?? 0, 'pockets', (vol / 1000).toFixed(0), 'cm3', (performance.now() - t).toFixed(0), 'ms', L.layout.warnings);
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

  it('engraves labels on panels and frame parts', () => {
    const vol = (engrave: boolean) => {
      const p = defaultProject();
      p.printer.engrave = engrave;
      const L = computeLayout(K, p);
      const s = new Scope();
      const cache = prepareTools(K, L, p, s);
      const out = ['p0_0', 'f0'].map((id) => {
        const m = buildPiece(K, L, id, cache)!;
        expect(m.decompose().length).toBe(1);
        const v = m.volume();
        m.delete();
        return v;
      });
      s.free();
      L.scope.free();
      return out;
    };
    const [p0, f0] = vol(false);
    const [p1, f1] = vol(true);
    console.log('engraved volume mm3: panel', (p0 - p1).toFixed(1), 'frame', (f0 - f1).toFixed(1));
    expect(p0 - p1).toBeGreaterThan(2);
    expect(f0 - f1).toBeGreaterThan(5);
  });

  it('builds an integrated frame into the edge panels', () => {
    for (const shape of ['rect', 'ellipse'] as const) {
      const p = defaultProject();
      p.wall.shape = shape;
      p.frame.mode = 'integrated';
      p.frame.width = 22;
      const L = computeLayout(K, p);
      const { pieces, warnings, outer } = L.layout;
      expect(warnings).toEqual([]);
      expect(pieces.every((x) => x.kind === 'panel')).toBe(true);
      const area = (polys: [number, number][][]) => polys.reduce((a, q) => a + signedArea(q), 0);
      const total = pieces.reduce((a, pc) => a + area(pc.polys), 0);
      expect(Math.abs(total - area(outer))).toBeLessThan(area(outer) * 0.001);
      for (const pc of pieces) expect(pc.printAngle).not.toBeNull();
      const s = new Scope();
      const cache = prepareTools(K, L, p, s);
      const edge = pieces.filter((pc) => pc.framePolys);
      expect(edge.length).toBeGreaterThan(4);
      for (const pc of edge) {
        const m = buildPiece(K, L, pc.id, cache)!;
        expect(m.decompose().length).toBe(1);
        expect(m.boundingBox().max[2]).toBeCloseTo(L.frontZ, 1);
        m.delete();
      }
      console.log(shape, 'integrated:', pieces.length, 'panels,', edge.length, 'with frame;', pieces.map((x) => x.printSize.map(Math.round).join('x')).join(' '));
      s.free();
      L.scope.free();
    }
  });

  it('cuts LED channels in separate and integrated frames', () => {
    for (const mode of ['separate', 'integrated'] as const)
      for (const led of ['front', 'halo'] as const) {
        const p = defaultProject();
        p.frame.mode = mode;
        p.frame.width = 24;
        p.frame.led.mode = led;
        const L = computeLayout(K, p);
        const s = new Scope();
        const cache = prepareTools(K, L, p, s);
        const ids = L.layout.pieces.filter((x) => x.kind === 'frame' || x.framePolys).map((x) => x.id);
        for (const id of ids.slice(0, 4)) {
          const m = buildPiece(K, L, id, cache)!;
          expect(m.decompose().length).toBe(1);
          m.delete();
        }
        s.free();
        L.scope.free();
      }
  });

  it('builds all accessories', () => {
    for (const def of ACCESSORIES) {
      const s = new Scope();
      const m = buildAccessory(K, s, def.type, defaultParams(def.type));
      expect(m.status()).toBe('NoError');
      expect(m.volume()).toBeGreaterThan(500);
      const bb = m.boundingBox();
      console.log(def.type, m.decompose().length, bb.min.map(Math.round), bb.max.map(Math.round));
      expect(m.decompose().length).toBe(1);
      s.free();
    }
  });
});
