import { create } from 'zustand';
import { geometry } from '../geometry/client';
import type { AccessoryShape, Layout, MeshData } from '../geometry/layoutTypes';
import { useStore } from './store';
import type { Project } from './types';

interface GeoState {
  layout: Layout | null;
  layoutBusy: boolean;
  shapes: Record<string, AccessoryShape>;
  meshes: Record<string, MeshData>;
  meshKey: string;
  build: { done: number; total: number } | null;
  error: string | null;
}

export const useGeo = create<GeoState>(() => ({
  layout: null,
  layoutBusy: false,
  shapes: {},
  meshes: {},
  meshKey: '',
  build: null,
  error: null,
}));

export const shapeKey = (type: string, params: Record<string, number>) => JSON.stringify([type, params]);
const geomKey = (p: Project) => JSON.stringify([p.wall, p.frame, p.grid, p.mount, p.cells, p.cutouts, p.printer]);

let layoutTimer: ReturnType<typeof setTimeout> | undefined;
let layoutSeq = 0;
let lastGeom = '';
const requestedShapes = new Set<string>();
let buildHandle: number | null = null;

function refreshLayout(project: Project) {
  const key = geomKey(project);
  if (key === lastGeom) return;
  lastGeom = key;
  clearTimeout(layoutTimer);
  useGeo.setState({ layoutBusy: true });
  layoutTimer = setTimeout(async () => {
    const seq = ++layoutSeq;
    try {
      const layout = await geometry.layout(project);
      if (seq === layoutSeq) {
        useGeo.setState({ layout, layoutBusy: false, error: null });
        for (const k of layout.connectors) ensureShape('connector', k.params);
      }
    } catch (e) {
      if (seq === layoutSeq) useGeo.setState({ layoutBusy: false, error: String(e) });
    }
    maybeBuild();
  }, 120);
}

function refreshShapes(project: Project) {
  for (const a of project.accessories) {
    const k = shapeKey(a.type, a.params);
    if (requestedShapes.has(k)) continue;
    requestedShapes.add(k);
    geometry
      .accessory(a.type, a.params)
      .then((shape) => useGeo.setState((s) => ({ shapes: { ...s.shapes, [k]: shape } })))
      .catch(() => requestedShapes.delete(k));
  }
}

/** Builds 3D meshes for every piece when the 3D view is open. */
function maybeBuild() {
  const { view, project } = useStore.getState();
  if (view !== '3d') return;
  const key = geomKey(project);
  const geo = useGeo.getState();
  if (geo.meshKey === key && (geo.build === null || buildHandle !== null)) return;
  const fresh: Record<string, MeshData> = {};
  useGeo.setState({ meshKey: key, build: { done: 0, total: geo.layout?.pieces.length ?? 0 } });
  const { id, promise } = geometry.build(project, (mesh) => {
    fresh[mesh.id] = mesh;
    // Swap in the new meshes once the first one arrives, keep old ones until replaced.
    useGeo.setState((s) => ({ meshes: { ...(s.meshKey === key ? s.meshes : {}), ...fresh } }));
  });
  buildHandle = id;
  promise
    .then(() => {
      if (buildHandle !== id) return;
      buildHandle = null;
      // Drop meshes of pieces that no longer exist.
      useGeo.setState({ meshes: fresh, build: null });
    })
    .catch((e) => useGeo.setState({ error: String(e), build: null }));
}

geometry.onProgress((id, done, total) => {
  if (id === buildHandle) useGeo.setState({ build: { done, total } });
});

export function startGeometrySync() {
  const s = useStore.getState();
  refreshLayout(s.project);
  refreshShapes(s.project);
  useStore.subscribe((st, prev) => {
    if (st.project !== prev.project) {
      refreshLayout(st.project);
      refreshShapes(st.project);
    }
    if (st.view !== prev.view) maybeBuild();
  });
}

export function ensureShape(type: string, params: Record<string, number>) {
  const k = shapeKey(type, params);
  if (requestedShapes.has(k)) return;
  requestedShapes.add(k);
  geometry
    .accessory(type, params)
    .then((shape) => useGeo.setState((s) => ({ shapes: { ...s.shapes, [k]: shape } })))
    .catch(() => requestedShapes.delete(k));
}
