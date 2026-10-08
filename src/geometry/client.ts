import type { Project } from '../model/types';
import type { AccessoryShape, Layout, MeshData } from './layoutTypes';
import type { WorkerRequest, WorkerResponse } from './worker';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onMesh?: (m: MeshData) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const progressListeners = new Set<(id: number, done: number, total: number) => void>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg.type === 'ready') return;
    const p = pending.get(msg.id);
    switch (msg.type) {
      case 'progress':
        progressListeners.forEach((l) => l(msg.id, msg.done, msg.total));
        return;
      case 'mesh':
        p?.onMesh?.(msg.mesh);
        return;
      case 'error':
        pending.delete(msg.id);
        p?.reject(new Error(msg.message));
        return;
      case 'layout':
        pending.delete(msg.id);
        p?.resolve(msg.layout);
        return;
      case 'accessory':
        pending.delete(msg.id);
        p?.resolve(msg.shape);
        return;
      case 'buildDone':
        pending.delete(msg.id);
        p?.resolve(undefined);
        return;
      case 'export':
        pending.delete(msg.id);
        p?.resolve({ data: msg.data, filename: msg.filename });
        return;
    }
  };
  return worker;
}

type Body<T> = T extends { id: number } ? Omit<T, 'id'> : never;

function call<T>(req: Body<WorkerRequest>, onMesh?: (m: MeshData) => void): { id: number; promise: Promise<T> } {
  const id = nextId++;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onMesh });
  });
  getWorker().postMessage({ ...req, id } as WorkerRequest);
  return { id, promise };
}

export const geometry = {
  layout: (project: Project) => call<Layout>({ type: 'layout', project }).promise,
  build: (project: Project, onMesh: (m: MeshData) => void) => call<void>({ type: 'build', project }, onMesh),
  accessory: (accType: string, params: Record<string, number>) =>
    call<AccessoryShape>({ type: 'accessory', key: '', accType, params }).promise,
  export: (
    project: Project,
    format: 'stl' | '3mf',
    include: { panels: boolean; frame: boolean; accessories: boolean },
    names: Record<string, string>,
  ) => call<{ data: Uint8Array; filename: string }>({ type: 'export', project, format, include, names }),
  onProgress(fn: (id: number, done: number, total: number) => void) {
    progressListeners.add(fn);
    return () => progressListeners.delete(fn);
  },
};
