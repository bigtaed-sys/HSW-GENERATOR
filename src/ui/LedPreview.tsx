import { useEffect, useMemo, useRef } from 'react';
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

/** A band along a closed path: between offsets o0..o1 (flat at z0) or standing from z0 to z1, with per-side colours. */
function ribbon(path: Vec2[], o0: number, o1: number, z0: number, z1: number, c0?: THREE.Color, c1?: THREE.Color) {
  const ns = normals(path);
  const n = path.length;
  const pos = new Float32Array(n * 6);
  const col = new Float32Array(n * 6);
  path.forEach(([x, y], i) => {
    const [nx, ny] = ns[i];
    pos.set([x + nx * o0, y + ny * o0, z0, x + nx * o1, y + ny * o1, z1], i * 6);
    if (c0 && c1) col.set([c0.r, c0.g, c0.b, c1.r, c1.g, c1.b], i * 6);
  });
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (c0 && c1) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Brightness of the hottest groove; above 1 so the bloom pass picks it up. */
const GAIN = 3.2;

/** The strip: a white PCB along its route with 5050 LEDs every 1/60 m. */
function Strip({ led, color }: { led: LayoutLed; color: THREE.Color }) {
  const inst = useRef<THREE.InstancedMesh>(null);
  const count = led.leds.length / 4;
  const pcb = useMemo(
    () =>
      led.kind === 'inside'
        ? ribbon(led.path, 0, 0, led.z0, led.z1)
        : ribbon(led.path, -led.width / 2, led.width / 2, led.z0, led.z1),
    [led],
  );
  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const [x, y, nx, ny] = led.leds.subarray(i * 4, i * 4 + 4);
      if (led.kind === 'inside') {
        // Standing strip: LEDs face into the hollow (the path normal points outwards).
        o.position.set(x - nx * 1.1, y - ny * 1.1, (led.z0 + led.z1) / 2);
        o.rotation.set(0, 0, Math.atan2(ny, nx));
        o.scale.set(1.4, 5, Math.min(5, led.z1 - led.z0));
      } else {
        o.position.set(x, y, led.z0 + (led.kind === 'front' ? 0.9 : -0.9));
        o.rotation.set(0, 0, 0);
        o.scale.set(5, 5, 1.4);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [led, count]);
  const hot = useMemo(() => color.clone().multiplyScalar(5), [color]);
  return (
    <group>
      <mesh geometry={pcb}>
        <meshStandardMaterial color="#efefe9" roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={inst} args={[undefined, undefined, count]} key={count}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={hot} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/**
 * Lighting preview: the strip, and the light that gets out — through the
 * groove floors and the tiles of a Backlit cells frame, or onto the wall
 * around a halo strip. `lift` follows the frame in the exploded view.
 */
export function LedPreview({ led, color, lift, size }: { led: LayoutLed; color: string; lift: number; size: number }) {
  const c = useMemo(() => new THREE.Color(color), [color]);
  const glows = useMemo(() => {
    if (led.glow)
      return led.glow.map((gl) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(gl.positions, 3));
        const col = new Float32Array(gl.positions.length);
        gl.light.forEach((v, i) => col.set([c.r * v * GAIN, c.g * v * GAIN, c.b * v * GAIN], i * 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setIndex(new THREE.BufferAttribute(gl.indices, 1));
        return g;
      });
    if (led.kind === 'halo') {
      // Light thrown onto the wall around the frame, fading outwards.
      const reach = Math.max(60, size * 0.12);
      return [ribbon(led.path, led.width / 2, led.width / 2 + reach, -0.5, -0.5, c.clone().multiplyScalar(1.6), new THREE.Color(0, 0, 0))];
    }
    return [];
  }, [led, c, size]);
  const mat = useMemo(
    // Added on top of the lit surface, so the parts keep their own colour.
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  const halo = led.kind === 'halo';
  return (
    <group>
      <group position={[0, 0, led.kind === 'front' ? lift : 0]}>
        <Strip led={led} color={c} />
      </group>
      {glows.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} position={[0, 0, halo ? 0 : lift]} />
      ))}
    </group>
  );
}
