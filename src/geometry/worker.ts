/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { strToU8, zipSync } from 'fflate';
import type { Project } from '../model/types';
import { meshToStl } from '../export/stl';
import { makeTestKit } from '../model/testKit';
import { meshesTo3mf } from '../export/threemf';
import { buildAccessory } from './accessories/build';
import { accessoryDef } from './accessories/defs';
import { buildPiece, prepareTools, toMesh } from './build';
import { PITCH_X, PITCH_Y } from './constants';
import { polysOf, Scope, type Kernel, type Manifold } from './kernel';
import { computeLayout, type LayoutInternal } from './layout';
import type { AccessoryShape, MeshData } from './layoutTypes';

export type WorkerRequest =
  | { type: 'layout'; id: number; project: Project }
  | { type: 'build'; id: number; project: Project }
  | { type: 'accessory'; id: number; key: string; accType: string; params: Record<string, number> }
  | {
      type: 'export';
      id: number;
      project: Project;
      format: 'stl' | '3mf';
      include: { panels: boolean; frame: boolean; accessories: boolean };
      names: Record<string, string>;
      /** Export the small fit-test kit instead of the wall. */
      testKit?: boolean;
    };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'layout'; id: number; layout: LayoutInternal['layout'] }
  | { type: 'mesh'; id: number; mesh: MeshData }
  | { type: 'buildDone'; id: number }
  | { type: 'accessory'; id: number; shape: AccessoryShape }
  | { type: 'export'; id: number; data: Uint8Array; filename: string }
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let K: Kernel;
const ready = Module({ locateFile: () => wasmUrl }).then((m) => {
  m.setup();
  K = m;
  ctx.postMessage({ type: 'ready' } satisfies WorkerResponse);
});

/** Only the parts of the project that change panel geometry. */
const geomKey = (p: Project) =>
  JSON.stringify([p.wall, p.frame, p.grid, p.mount, p.cells, p.cutouts, p.printer]);

let current: { key: string; L: LayoutInternal } | null = null;
let tools: { key: string; scope: Scope; cache: Map<string, Manifold> } | null = null;
const meshCache = new Map<string, MeshData>(); // `${geomKey}|${pieceId}`
let latestBuild = 0;

function layoutFor(project: Project): LayoutInternal {
  const key = geomKey(project);
  if (current?.key === key) return current.L;
  if (tools) {
    tools.scope.free();
    tools = null;
  }
  current?.L.scope.free();
  current = { key, L: computeLayout(K, project) };
  return current.L;
}

function toolsFor(project: Project, L: LayoutInternal) {
  const key = geomKey(project);
  if (tools?.key === key) return tools.cache;
  tools?.scope.free();
  const scope = new Scope();
  tools = { key, scope, cache: prepareTools(K, L, project, scope) };
  return tools.cache;
}

function pieceMesh(project: Project, id: string): MeshData | null {
  const L = layoutFor(project);
  const ck = `${geomKey(project)}|${id}`;
  const hit = meshCache.get(ck);
  if (hit) return hit;
  const m = buildPiece(K, L, id, toolsFor(project, L));
  if (!m) return null;
  const mesh = toMesh(id, m);
  m.delete();
  if (meshCache.size > 400) meshCache.clear();
  meshCache.set(ck, mesh);
  return mesh;
}

const accCache = new Map<string, AccessoryShape>();
function accessoryShape(accType: string, params: Record<string, number>): AccessoryShape {
  const key = JSON.stringify([accType, params]);
  const hit = accCache.get(key);
  if (hit) return hit;
  const s = new Scope();
  try {
    const m = buildAccessory(K, s, accType, params);
    const outline = polysOf(s.t(m.project()));
    const def = accessoryDef(accType);
    const shape: AccessoryShape = {
      key,
      mesh: toMesh(key, m),
      outline,
      side: polysOf(s.t(s.t(m.rotate([0, 90, 0])).project())),
      pegs: (def?.pegs(params) ?? []).map(([dc, dr]) => [dc * PITCH_X, dr * PITCH_Y]),
    };
    if (accCache.size > 200) accCache.clear();
    accCache.set(key, shape);
    return shape;
  } finally {
    s.free();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Moves a mesh so it lies on the bed: rotated by `angle`, centred, z from 0. */
function placeForPrint(mesh: MeshData, angle: number): MeshData {
  const r = (angle * Math.PI) / 180;
  const c = Math.cos(r),
    sn = Math.sin(r);
  const p = new Float32Array(mesh.positions.length);
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = mesh.positions[i],
      y = mesh.positions[i + 1];
    p[i] = x * c - y * sn;
    p[i + 1] = x * sn + y * c;
    p[i + 2] = mesh.positions[i + 2];
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
    z0 = Math.min(z0, p[i + 2]);
  }
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= cx;
    p[i + 1] -= cy;
    p[i + 2] -= z0;
  }
  return { ...mesh, positions: p };
}

/** Lays an accessory on the bed using its catalogue print rotation. */
function accessoryForPrint(type: string, params: Record<string, number>): MeshData {
  const s = new Scope();
  try {
    const rot = accessoryDef(type)?.printRot ?? [0, 90, 0];
    const m = s.t(buildAccessory(K, s, type, params).rotate(rot));
    return placeForPrint(toMesh(type, m), 0);
  } finally {
    s.free();
  }
}

async function handle(msg: WorkerRequest) {
  await ready;
  switch (msg.type) {
    case 'layout': {
      const L = layoutFor(msg.project);
      ctx.postMessage({ type: 'layout', id: msg.id, layout: L.layout } satisfies WorkerResponse);
      break;
    }
    case 'build': {
      latestBuild = msg.id;
      const L = layoutFor(msg.project);
      const ids = L.layout.pieces.map((p) => p.id);
      for (let i = 0; i < ids.length; i++) {
        if (latestBuild !== msg.id) return;
        const mesh = pieceMesh(msg.project, ids[i]);
        if (mesh) ctx.postMessage({ type: 'mesh', id: msg.id, mesh } satisfies WorkerResponse);
        ctx.postMessage({ type: 'progress', id: msg.id, done: i + 1, total: ids.length } satisfies WorkerResponse);
        await tick();
      }
      ctx.postMessage({ type: 'buildDone', id: msg.id } satisfies WorkerResponse);
      break;
    }
    case 'accessory': {
      const shape = accessoryShape(msg.accType, msg.params);
      ctx.postMessage({ type: 'accessory', id: msg.id, shape } satisfies WorkerResponse);
      break;
    }
    case 'export': {
      const { names } = msg;
      const project = msg.testKit ? makeTestKit(msg.project) : msg.project;
      const include = msg.testKit ? { panels: true, frame: true, accessories: true } : msg.include;
      const L = layoutFor(project);
      const items: { name: string; mesh: MeshData }[] = [];
      const pieces = L.layout.pieces.filter((p) => (p.kind === 'panel' ? include.panels : include.frame));
      const total = pieces.length + (include.accessories ? project.accessories.length : 0);
      let done = 0;
      for (const piece of pieces) {
        const mesh = pieceMesh(project, piece.id);
        if (mesh) items.push({ name: `${names[piece.kind] ?? piece.kind}-${piece.label}`, mesh: placeForPrint(mesh, piece.printAngle ?? 0) });
        ctx.postMessage({ type: 'progress', id: msg.id, done: ++done, total } satisfies WorkerResponse);
        await tick();
      }
      if (include.accessories) {
        const unique = new Map<string, { type: string; params: Record<string, number>; count: number }>();
        for (const a of project.accessories) {
          const k = JSON.stringify([a.type, a.params]);
          const u = unique.get(k);
          if (u) u.count++;
          else unique.set(k, { type: a.type, params: a.params, count: 1 });
        }
        let i = 0;
        for (const u of unique.values()) {
          const suffix = u.count > 1 ? ` x${u.count}` : '';
          items.push({ name: `${names[u.type] ?? u.type}-${++i}${suffix}`, mesh: accessoryForPrint(u.type, u.params) });
          done += u.count;
          ctx.postMessage({ type: 'progress', id: msg.id, done, total } satisfies WorkerResponse);
          await tick();
        }
      }
      const safe = (s: string) => s.replace(/[^\p{L}\p{N}\-_ .]+/gu, '_');
      const base = safe(project.name || 'hsw-wall');
      let data: Uint8Array;
      if (msg.format === '3mf') {
        data = meshesTo3mf(items);
        ctx.postMessage({ type: 'export', id: msg.id, data, filename: `${base}.3mf` } satisfies WorkerResponse, [data.buffer]);
      } else {
        const files: Record<string, Uint8Array> = {};
        for (const it of items) files[`${safe(it.name)}.stl`] = meshToStl(it.mesh, it.name);
        files['project.hsw.json'] = strToU8(JSON.stringify({ ...project, customModels: [] }, null, 2));
        data = zipSync(files, { level: 6 });
        ctx.postMessage({ type: 'export', id: msg.id, data, filename: `${base}.zip` } satisfies WorkerResponse, [data.buffer]);
      }
      break;
    }
  }
}

let queue = Promise.resolve();
ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  // A new build cancels the running one between pieces.
  if (msg.type === 'build') latestBuild = msg.id;
  queue = queue.then(() =>
    handle(msg).catch((err) => {
      ctx.postMessage({ type: 'error', id: msg.id, message: String(err?.message ?? err) } satisfies WorkerResponse);
    }),
  );
};

