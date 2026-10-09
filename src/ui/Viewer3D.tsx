import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DEPTH } from '../geometry/constants';
import { cellAt, cellCenter } from '../geometry/lattice';
import { defaultParams } from '../geometry/accessories/defs';
import { PALETTE } from '../model/defaults';
import { cellIndex, isPlacementValid } from '../model/placement';
import type { MeshData } from '../geometry/layoutTypes';
import { useT } from '../i18n';
import { ensureShape, shapeKey, useGeo } from '../model/geo';
import { uid, useStore } from '../model/store';
import { preparedModel } from './customModel';
import { LedPreview } from './LedPreview';
import { Bloom, EffectComposer } from '@react-three/postprocessing';

const geomCache = new WeakMap<MeshData, THREE.BufferGeometry>();

function toGeometry(mesh: MeshData) {
  let g = geomCache.get(mesh);
  if (!g) {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    // Flat shading: split vertices so hard edges stay crisp.
    g = indexed.toNonIndexed();
    g.computeVertexNormals();
    g.computeBoundingBox();
    indexed.dispose();
    geomCache.set(mesh, g);
  }
  return g;
}

function useThemeBg() {
  const theme = useStore((s) => s.theme);
  const dark =
    theme === 'dark' || (theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? { bg: '#0d0d0f', wall: '#3b3b42' } : { bg: '#e9e6e1', wall: '#dcd8d1' };
}

function CameraRig({ w, h }: { w: number; h: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const fitted = useRef('');
  const fit = useCallback(() => {
    const tan = Math.tan(((camera.fov ?? 35) * Math.PI) / 360);
    const aspect = size.width / Math.max(1, size.height);
    const d = Math.max(h / 2 / tan, w / 2 / (tan * aspect)) * 1.18;
    camera.position.set(d * 0.16, -d * 0.1, d);
    camera.near = Math.max(1, d / 200);
    camera.far = d * 20;
    camera.updateProjectionMatrix();
    controls?.target.set(0, 0, 0);
    controls?.update();
  }, [camera, controls, size.width, size.height, w, h]);
  useEffect(() => {
    const key = `${Math.round(w)}x${Math.round(h)}|${controls ? 1 : 0}`;
    if (fitted.current === key || !w || !size.width) return;
    fitted.current = key;
    fit();
  }, [w, h, controls, size.width, fit]);
  useEffect(() => {
    window.addEventListener('hsw-fit', fit);
    return () => window.removeEventListener('hsw-fit', fit);
  }, [fit]);
  return null;
}

function Scene() {
  const layout = useGeo((s) => s.layout);
  const meshes = useGeo((s) => s.meshes);
  const shapes = useGeo((s) => s.shapes);
  const project = useStore((s) => s.project);
  const exploded = useStore((s) => s.exploded);
  const showAcc = useStore((s) => s.showAccessories);
  const selection = useStore((s) => s.selection);
  const setUi = useStore((s) => s.setUi);
  const ledOn = useStore((s) => s.ledSim) && !!layout?.led;
  const { wall: wallDay } = useThemeBg();
  // Lights off for the LED preview: a dim room so the strip shows.
  const dim = ledOn ? 0.3 : 1;
  const wall = wallDay;

  const panelMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: project.colors.panel, roughness: 0.62, metalness: 0.02 }),
    [project.colors.panel],
  );

  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: project.colors.frame, roughness: 0.5, metalness: 0.02 }),
    [project.colors.frame],
  );
  const w = layout?.stats.width ?? 900;
  const h = layout?.stats.height ?? 600;

  return (
    <>
      <CameraRig w={w} h={h} />
      <hemisphereLight args={['#ffffff', '#8a7f70', 0.9 * dim]} />
      <directionalLight
        position={[-w * 0.6, h * 1.2, Math.max(w, h) * 1.2]}
        intensity={1.6 * dim}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-w}
        shadow-camera-right={w}
        shadow-camera-top={h}
        shadow-camera-bottom={-h}
        shadow-camera-far={Math.max(w, h) * 4}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[w, -h * 0.4, w * 0.6]} intensity={0.35 * dim} />
      {ledOn && layout?.led && (
        <LedPreview
          led={layout.led}
          color={project.frame.led.color}
          lift={exploded ? (project.frame.mode === 'integrated' ? 15 : 30) : 0}
          size={Math.max(w, h)}
        />
      )}
      {ledOn && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={1.4} radius={0.75} />
        </EffectComposer>
      )}
      {/* Room wall */}
      <mesh position={[0, 0, -0.6]} receiveShadow>
        <planeGeometry args={[w * 6, h * 6]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      {layout?.pieces.map((p) => {
        const mesh = meshes[p.id];
        if (!mesh) return null;
        const cx = (p.bbox[0] + p.bbox[2]) / 2,
          cy = (p.bbox[1] + p.bbox[3]) / 2;
        const k = exploded ? 0.12 : 0;
        return (
          <mesh
            key={p.id}
            geometry={toGeometry(mesh)}
            material={p.kind === 'frame' ? frameMat : panelMat}
            position={[cx * k, cy * k, exploded ? (p.kind === 'frame' ? 30 : 15) : 0]}
            castShadow
            receiveShadow
          />
        );
      })}
      {layout?.connectors.map((k) => {
        const shape = shapes[shapeKey('connector', k.params)];
        if (!shape) return null;
        return (
          <mesh
            key={k.id}
            geometry={toGeometry(shape.mesh)}
            position={[k.screw[0], k.screw[1], DEPTH + (exploded ? 40 : 0)]}
            rotation={[0, 0, (k.rot * Math.PI) / 180]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={project.colors.connector} roughness={0.55} />
          </mesh>
        );
      })}
      {showAcc &&
        project.accessories.map((a) => {
          const shape = shapes[shapeKey(a.type, a.params)];
          if (!shape) return null;
          const [x, y] = cellCenter(a.c, a.r, project.grid);
          const sel = selection?.kind === 'accessory' && selection.id === a.id;
          return (
            <mesh
              key={a.id}
              geometry={toGeometry(shape.mesh)}
              position={[x, y, DEPTH + (exploded ? 60 : 0)]}
              castShadow
              receiveShadow
              onPointerDown={(e) => {
                if (e.button !== 0 || useStore.getState().placing) return;
                e.stopPropagation();
                setUi({ selection: { kind: 'accessory', id: a.id }, rightTab: 'inspector' });
                startDrag(a.id, e.point.x - x, e.point.y - y);
              }}
              onPointerOver={() => (document.body.style.cursor = 'grab')}
              onPointerOut={() => (document.body.style.cursor = '')}
            >
              <meshStandardMaterial color={a.color} roughness={0.55} emissive={sel ? '#f2a93b' : '#000'} emissiveIntensity={sel ? 0.25 : 0} />
            </mesh>
          );
        })}
      {showAcc &&
        project.customModels.map((m) => {
          const [x, y] = cellCenter(m.c, m.r, project.grid);
          return <CustomMesh key={m.id} id={m.id} position={[x + m.offset[0], y + m.offset[1], DEPTH + m.offset[2] + (exploded ? 60 : 0)]} />;
        })}
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxDistance={Math.max(w, h) * 6} />
      <Interaction />
    </>
  );
}

// ---- Placing and dragging accessories on the wall ------------------------------

const drag3d: { id: string | null; grab: [number, number]; moved: boolean } = { id: null, grab: [0, 0], moved: false };
/** Set when a pointer-up already handled the click, so the canvas does not also clear the selection. */
let clickHandled = false;
let dragStarted: (() => void) | null = null;

function startDrag(id: string, gx: number, gy: number) {
  useStore.getState().checkpoint();
  drag3d.id = id;
  drag3d.grab = [gx, gy];
  drag3d.moved = false;
  dragStarted?.();
}

const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -DEPTH);

/** Handles pointer input against the wall front plane: placement ghost, click-to-place and dragging. */
function Interaction() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const placing = useStore((s) => s.placing);
  const grid = useStore((s) => s.project.grid);
  const accessories = useStore((s) => s.project.accessories);
  const layout = useGeo((s) => s.layout);
  const shapes = useGeo((s) => s.shapes);
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);
  const index = useMemo(() => cellIndex(layout), [layout]);

  useEffect(() => {
    dragStarted = () => {
      if (controls) controls.enabled = false;
      document.body.style.cursor = 'grabbing';
    };
    return () => {
      dragStarted = null;
    };
  }, [controls]);

  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    const worldAt = (e: PointerEvent): [number, number] | null => {
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      return ray.ray.intersectPlane(wallPlane, hit) ? [hit.x, hit.y] : null;
    };
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const w = worldAt(e);
      if (!w) return;
      const st = useStore.getState();
      if (drag3d.id) {
        const cell = cellAt(w[0] - drag3d.grab[0], w[1] - drag3d.grab[1], st.project.grid);
        const cur = st.project.accessories.find((a) => a.id === drag3d.id);
        if (cur && (cur.c !== cell.c || cur.r !== cell.r)) {
          drag3d.moved = true;
          st.update(
            (p) => {
              const a = p.accessories.find((q) => q.id === drag3d.id);
              if (a) {
                a.c = cell.c;
                a.r = cell.r;
              }
            },
            { transient: true },
          );
        }
      } else if (st.placing) {
        const cell = cellAt(w[0], w[1], st.project.grid);
        setHover((h) => (h && h.c === cell.c && h.r === cell.r ? h : cell));
      }
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      clickHandled = false;
    };
    const onUp = (e: PointerEvent) => {
      const st = useStore.getState();
      if (drag3d.id) {
        clickHandled = true;
        if (drag3d.moved) st.update(() => {});
        drag3d.id = null;
        if (controls) controls.enabled = true;
        document.body.style.cursor = '';
        return;
      }
      // A click (not an orbit drag) while placing drops the accessory on the cell under the cursor.
      if (st.placing && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && e.button === 0) {
        const w = worldAt(e);
        if (w) {
          clickHandled = true;
          const cell = cellAt(w[0], w[1], st.project.grid);
          const id = uid();
          const type = st.placing;
          st.update((p) => void p.accessories.push({ id, type, c: cell.c, r: cell.r, params: defaultParams(type), color: PALETTE[p.accessories.length % 7] }));
          st.setUi({ placing: e.shiftKey ? type : null, selection: { kind: 'accessory', id }, rightTab: 'inspector' });
        }
      }
      down = null;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, controls]);

  useEffect(() => {
    if (!placing) setHover(null);
    else ensureShape(placing, defaultParams(placing));
  }, [placing]);

  if (!placing || !hover) return null;
  const params = defaultParams(placing);
  const shape = shapes[shapeKey(placing, params)];
  if (!shape) return null;
  const valid = isPlacementValid({ id: '', type: placing, c: hover.c, r: hover.r, params }, index, accessories);
  const [x, y] = cellCenter(hover.c, hover.r, grid);
  return (
    <mesh geometry={toGeometry(shape.mesh)} position={[x, y, DEPTH]} raycast={() => null}>
      <meshStandardMaterial color={valid ? '#f2a93b' : '#e5484d'} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

function CustomMesh({ id, position }: { id: string; position: [number, number, number] }) {
  const m = useStore((s) => s.project.customModels.find((x) => x.id === id));
  const geom = useMemo(() => {
    if (!m) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(preparedModel(m).positions, 3));
    g.computeVertexNormals();
    return g;
  }, [m?.id, m?.rot.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || !geom) return null;
  return (
    <mesh geometry={geom} position={position} castShadow>
      <meshStandardMaterial color={m.color} roughness={0.55} />
    </mesh>
  );
}

export function Viewer3D() {
  const t = useT();
  const build = useGeo((s) => s.build);
  const { bg: day } = useThemeBg();
  const sim = useStore((s) => s.ledSim);
  const hasLed = useGeo((s) => !!s.layout?.led);
  const ledOn = sim && hasLed;
  const bg = ledOn ? '#060608' : day;
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 35, position: [0, 0, 1200], up: [0, 1, 0] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ position: 'absolute', inset: 0, background: bg }}
        onPointerMissed={() => {
          if (!clickHandled) useStore.getState().setUi({ selection: null });
          clickHandled = false;
        }}
      >
        <color attach="background" args={[bg]} />
        <Scene />
      </Canvas>
      {build && build.total > 0 && build.done < build.total && (
        <div className="progress">
          <svg className="spin" width="14" height="14" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="40 20" />
          </svg>
          {t('building', { d: build.done, t: build.total })}
          <div className="bar">
            <i style={{ width: `${(build.done / build.total) * 100}%` }} />
          </div>
        </div>
      )}
    </>
  );
}
