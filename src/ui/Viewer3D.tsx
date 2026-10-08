import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DEPTH } from '../geometry/constants';
import { cellCenter } from '../geometry/lattice';
import type { MeshData } from '../geometry/layoutTypes';
import { useT } from '../i18n';
import { shapeKey, useGeo } from '../model/geo';
import { useStore } from '../model/store';
import { preparedModel } from './customModel';

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
  const { wall } = useThemeBg();

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
      <hemisphereLight args={['#ffffff', '#8a7f70', 0.9]} />
      <directionalLight
        position={[-w * 0.6, h * 1.2, Math.max(w, h) * 1.2]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-w}
        shadow-camera-right={w}
        shadow-camera-top={h}
        shadow-camera-bottom={-h}
        shadow-camera-far={Math.max(w, h) * 4}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[w, -h * 0.4, w * 0.6]} intensity={0.35} />
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
              onClick={(e) => {
                e.stopPropagation();
                setUi({ selection: { kind: 'accessory', id: a.id }, rightTab: 'inspector' });
              }}
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
    </>
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
  const { bg } = useThemeBg();
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 35, position: [0, 0, 1200], up: [0, 1, 0] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ position: 'absolute', inset: 0, background: bg }}
        onPointerMissed={() => useStore.getState().setUi({ selection: null })}
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
