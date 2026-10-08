import type { MeshData } from '../geometry/layoutTypes';

export function meshToStl(mesh: Pick<MeshData, 'positions' | 'indices'>, name = 'hsw'): Uint8Array {
  const { positions: p, indices: idx } = mesh;
  const n = idx.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = `binary STL ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = idx[t * 3] * 3,
      b = idx[t * 3 + 1] * 3,
      c = idx[t * 3 + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    dv.setFloat32(o, nx, true);
    dv.setFloat32(o + 4, ny, true);
    dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      dv.setFloat32(o, p[v], true);
      dv.setFloat32(o + 4, p[v + 1], true);
      dv.setFloat32(o + 8, p[v + 2], true);
      o += 12;
    }
    o += 2;
  }
  return new Uint8Array(buf);
}

/** Parses binary or ASCII STL into a flat, non-indexed position array. */
export function parseStl(data: ArrayBuffer): Float32Array {
  const dv = new DataView(data);
  if (data.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === data.byteLength) {
      const out = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) {
        const o = 84 + t * 50 + 12;
        for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(data);
  const nums: number[] = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  return new Float32Array(nums);
}
