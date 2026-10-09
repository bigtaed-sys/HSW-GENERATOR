import { beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { computeLayout } from '../layout';
import { buildPiece, prepareTools } from '../build';
import { defaultProject } from '../../model/defaults';
import { OUTLINE_PRESETS, presetPoints } from '../../model/outlines';
import { Scope, signedArea, type Kernel } from '../kernel';

let K: Kernel;
beforeAll(async () => {
  K = await Module();
  K.setup();
});

describe('custom outlines', () => {
  it('lays out and builds every template in both frame modes', () => {
    const area = (polys: [number, number][][]) => polys.reduce((a, q) => a + signedArea(q), 0);
    for (const preset of OUTLINE_PRESETS)
      for (const mode of ['separate', 'integrated'] as const) {
        const p = defaultProject();
        p.wall.shape = 'custom';
        p.wall.width = 1100;
        p.wall.height = 800;
        p.wall.points = presetPoints(preset.id, 1100, 800);
        p.frame.mode = mode;
        const L = computeLayout(K, p);
        const { pieces, warnings, outer } = L.layout;
        expect(warnings, `${preset.id}/${mode}`).toEqual([]);
        const total = pieces.reduce((a, pc) => a + area(pc.polys), 0);
        const lapOverlap = mode === 'separate';
        if (!lapOverlap) expect(Math.abs(total - area(outer))).toBeLessThan(area(outer) * 0.001);
        const s = new Scope();
        const cache = prepareTools(K, L, p, s);
        // Build the frame-carrying pieces (the ones that care about the outline).
        const sample = pieces.filter((x) => x.kind === 'frame' || x.framePolys);
        for (const pc of sample) {
          const m = buildPiece(K, L, pc.id, cache)!;
          expect(m.decompose().length, `${preset.id}/${mode}/${pc.label}`).toBe(1);
          m.delete();
        }
        console.log(preset.id, mode, pieces.length, 'pieces');
        s.free();
        L.scope.free();
      }
  }, 120000);

  it('handles a hand-edited outline with a slanted concave edge', () => {
    for (const mode of ['separate', 'integrated'] as const) {
      const p = defaultProject();
      p.wall.shape = 'custom';
      p.wall.width = 900;
      p.wall.height = 665;
      p.wall.points = [[-450, -300], [0, -365], [450, -300], [450, 0], [65, 75], [0, 300], [-450, 300]];
      p.frame.mode = mode;
      const L = computeLayout(K, p);
      expect(L.layout.warnings, mode).toEqual([]);
      for (const pc of L.layout.pieces) expect(pc.polys.filter((q) => signedArea(q) > 0).length, `${mode}/${pc.label}`).toBe(1);
      L.scope.free();
    }
  });
});
