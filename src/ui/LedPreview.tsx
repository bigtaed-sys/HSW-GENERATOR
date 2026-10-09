import { useMemo } from 'react';
import * as THREE from 'three';
import type { LayoutLed } from '../geometry/layoutTypes';
import type { Vec2 } from '../geometry/lattice';

/** Unit outward normals at the vertices of a closed counter-clockwise path. */
function normals(path: Vec2[]): Vec2[] {
  const n = path.length;
  return path.map((_, i) => {
    const a = path[(i - 1 + n) % n],
      b = path[(i + 1) % n];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  });
}

/** A strip along a closed path: between offsets o0..o1 (flat at z0) or standing from z0 to z1; per-side brightness k0/k1. */
function ribbon(path: Vec2[], o0: number, o1: number, z0: number, z1: number, k0 = 1, k1 = 1, color = new THREE.Color('#fff')) {
  const ns = normals(path);
  const n = path.length;
  const pos = new Float32Array(n * 6);
  const col = new Float32Array(n * 6);
  path.forEach(([x, y], i) => {
    const [nx, ny] = ns[i];
    pos.set([x + nx * o0, y + ny * o0, z0, x + nx * o1, y + ny * o1, z1], i * 6);
    col.set([color.r * k0, color.g * k0, color.b * k0, color.r * k1, color.g * k1, color.b * k1], i * 6);
  });
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function mergeGeometries(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const pa = a.getAttribute('position').array as Float32Array,
    pb = b.getAttribute('position').array as Float32Array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa);
  pos.set(pb, pa.length);
  const off = pa.length / 3;
  const ia = Array.from(a.getIndex()!.array),
    ib = Array.from(b.getIndex()!.array).map((i) => i + off);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([...ia, ...ib]);
  return g;
}

const glowMaterial = () =>
  new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

/**
 * Lighting preview: the strip itself and what it lights up. `lift` follows
 * the frame in the exploded view so the strip shows between wall and frame.
 */
export function LedPreview({ led, color, lift, size }: { led: LayoutLed; color: string; lift: number; size: number }) {
  const c = useMemo(() => new THREE.Color(color), [color]);
  const strip = useMemo(() => {
    if (led.kind !== 'inside') return ribbon(led.path, -led.width / 2, led.width / 2, led.z0, led.z1);
    // Standing strip: its face against the wall, plus a 2 mm top edge so it reads from the front.
    const face = ribbon(led.path, 0, 0, led.z0, led.z1);
    const edge = ribbon(led.path, 0, -2, led.z1, led.z1);
    return mergeGeometries(face, edge);
  }, [led]);
  const glow = useMemo(() => {
    if (led.kind === 'inside' && led.glow) {
      // Light spreads through the hollow and fades away from the strip.
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(led.glow.positions, 3));
      const col = new Float32Array(led.glow.positions.length);
      led.glow.dist.forEach((d, i) => {
        const k = 0.12 + 0.75 * Math.exp(-d / 30);
        col.set([c.r * k, c.g * k, c.b * k], i * 3);
      });
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(led.glow.indices, 1));
      return g;
    }
    if (led.kind === 'halo') return ribbon(led.path, led.width / 2, led.width / 2 + Math.max(60, size * 0.12), -0.5, -0.5, 1, 0, c);
    // Front strip: a soft bloom over the groove.
    return ribbon(led.path, 0, led.width * 1.6, led.z0 + 0.4, led.z0 + 0.4, 0.8, 0, c);
  }, [led, c, size]);
  const glow2 = useMemo(() => (led.kind === 'front' ? ribbon(led.path, 0, -led.width * 1.6, led.z0 + 0.4, led.z0 + 0.4, 0.8, 0, c) : null), [led, c]);
  const mat = useMemo(glowMaterial, []);
  return (
    <group>
      <mesh geometry={strip} position={[0, 0, led.kind === 'front' ? lift : 0]}>
        <meshBasicMaterial color={c} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh geometry={glow} material={mat} position={[0, 0, led.kind === 'halo' ? 0 : lift]} renderOrder={2} />
      {glow2 && <mesh geometry={glow2} material={mat} position={[0, 0, lift]} renderOrder={2} />}
    </group>
  );
}
