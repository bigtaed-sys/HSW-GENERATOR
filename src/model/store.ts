import { create } from 'zustand';
import { defaultProject } from './defaults';
import type { Lang, Project } from './types';

export type Tool = 'select' | 'solid' | 'mount' | 'reset';
export type ViewMode = '2d' | '3d';
export type Theme = 'system' | 'light' | 'dark';
export type Selection = { kind: 'accessory' | 'cutout' | 'model'; id: string } | null;

interface UiState {
  lang: Lang;
  theme: Theme;
  view: ViewMode;
  tool: Tool;
  selection: Selection;
  placing: string | null; // accessory type being placed
  showPanels: boolean;
  showAccessories: boolean;
  exploded: boolean;
  leftTab: 'wall' | 'frame' | 'grid' | 'cutouts' | 'print';
  rightTab: 'library' | 'inspector';
}

interface Store extends UiState {
  project: Project;
  past: Project[];
  future: Project[];
  /** Apply a change and record it in the undo history. */
  update: (fn: (p: Project) => void, opts?: { transient?: boolean }) => void;
  /** Record the state before a sequence of transient updates (e.g. a drag). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setProject: (p: Project) => void;
  setUi: (ui: Partial<UiState>) => void;
}

const STORAGE_KEY = 'hsw-generator:v1';

function load(): { project?: Project; ui?: Partial<UiState> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function migrate(p: Partial<Project>): Project {
  const d = defaultProject();
  // v0.1 frames had a fixed profile instead of a style.
  const f = p.frame as (Partial<Project['frame']> & { profile?: string; profileSize?: number }) | undefined;
  if (f && f.profile && !f.style) {
    f.style = 'classic';
    f.styleParams = { classic: { profile: ['square', 'chamfer', 'round'].indexOf(f.profile), size: f.profileSize ?? 4 } };
    f.lip = 0;
    f.joint = 'none';
  }
  return {
    ...d,
    ...p,
    wall: { ...d.wall, ...p.wall },
    frame: { ...d.frame, ...p.frame },
    grid: { ...d.grid, ...p.grid },
    mount: { ...d.mount, ...p.mount },
    printer: { ...d.printer, ...p.printer },
    colors: { ...d.colors, ...p.colors },
    cells: p.cells ?? {},
    cutouts: p.cutouts ?? [],
    accessories: p.accessories ?? [],
    customModels: p.customModels ?? [],
    version: 1,
  };
}

const saved = load();
const browserLang: Lang =
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';

const clone = (p: Project): Project => structuredClone(p);
let pendingCheckpoint: Project | null = null;

export const useStore = create<Store>((set, get) => ({
  lang: browserLang,
  theme: 'system',
  view: '2d',
  tool: 'select',
  selection: null,
  placing: null,
  showPanels: true,
  showAccessories: true,
  exploded: false,
  leftTab: 'wall',
  rightTab: 'library',
  ...saved.ui,
  project: saved.project ? migrate(saved.project) : defaultProject(),
  past: [],
  future: [],

  update(fn, opts) {
    const before = get().project;
    const next = clone(before);
    fn(next);
    if (opts?.transient) {
      set({ project: next });
      return;
    }
    const base = pendingCheckpoint ?? before;
    pendingCheckpoint = null;
    set((s) => ({ project: next, past: [...s.past.slice(-99), base], future: [] }));
  },
  checkpoint() {
    pendingCheckpoint = get().project;
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: null });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project], selection: null });
  },
  setProject(p) {
    set((s) => ({ project: migrate(p), past: [...s.past, s.project], future: [], selection: null }));
  },
  setUi(ui) {
    set(ui as Partial<Store>);
  },
}));

// Persist the project and preferences.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ui: Partial<UiState> = {
      lang: s.lang,
      theme: s.theme,
      view: s.view,
      showPanels: s.showPanels,
      leftTab: s.leftTab,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: s.project, ui }));
    } catch {
      try {
        // Custom models can exceed the quota; keep the rest.
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: { ...s.project, customModels: [] }, ui }));
      } catch {
        // storage unavailable
      }
    }
  }, 300);
});

export const uid = () => Math.random().toString(36).slice(2, 10);
