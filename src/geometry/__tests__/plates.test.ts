import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { meshesToPlated3mf } from '../../export/plates3mf';

/** An axis-aligned box lying on the bed, centred on x/y. */
function box(w: number, h: number, d = 8) {
  const xs = [-w / 2, w / 2],
    ys = [-h / 2, h / 2],
    zs = [0, d];
  const positions: number[] = [];
  for (const z of zs) for (const y of ys) for (const x of xs) positions.push(x, y, z);
  const f = [[0, 2, 1], [1, 2, 3], [4, 5, 6], [5, 7, 6], [0, 1, 4], [1, 5, 4], [2, 6, 3], [3, 6, 7], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5]];
  return { positions: new Float32Array(positions), indices: new Uint32Array(f.flat()) };
}

describe('3MF with plates', () => {
  it('packs parts onto plates of the bed and lists every copy', () => {
    const bed = { w: 256, h: 256, margin: 5 };
    const items = [
      { name: 'A1', mesh: box(240, 200) },
      { name: 'A2', mesh: box(240, 200) },
      { name: 'F1', mesh: box(200, 60) },
      { name: 'hook x6', mesh: box(20, 30), count: 6 },
    ];
    const files = unzipSync(meshesToPlated3mf(items, bed, 'BambuStudio-01.10.00.00'));
    const model = strFromU8(files['3D/3dmodel.model']);
    const cfg = strFromU8(files['Metadata/model_settings.config']);
    expect(Object.keys(files).filter((f) => f.startsWith('3D/Objects/')).length).toBe(4);
    const plates = cfg.match(/<plate>/g)!.length;
    // Each big panel needs its own plate, F1 (60 mm deep) does not fit beside them; the hooks share F1's plate.
    expect(plates).toBe(3);
    const inst = [...cfg.matchAll(/<model_instance>/g)].length;
    expect(inst).toBe(3 + 6);
    // Every copy sits inside the plate it is listed on.
    const cols = 2;
    const items3 = [...model.matchAll(/<item objectid="(\d+)"[^>]*transform="[^"]* ([-\d.]+) ([-\d.]+) 0"/g)];
    expect(items3.length).toBe(9);
    for (const m of items3) {
      const x = +m[2],
        y = +m[3];
      const col = Math.floor(x / (bed.w * 1.2)),
        row = Math.floor(-y / (bed.h * 1.2) + 1);
      expect(col).toBeLessThan(cols);
      expect(x - col * bed.w * 1.2).toBeGreaterThan(0);
      expect(x - col * bed.w * 1.2).toBeLessThan(bed.w);
      expect(y + row * bed.h * 1.2).toBeGreaterThan(0);
      expect(y + row * bed.h * 1.2).toBeLessThan(bed.h);
    }
  });
});
