import { defaultParams } from '../geometry/accessories/defs';
import { PITCH_X, PITCH_Y } from '../geometry/constants';
import type { Project } from './types';

/**
 * A small wall built with the project's own settings: one panel of a few
 * cells, a frame split into several parts (so the joints get printed too),
 * a plain insert and a hook. Meant to check the fit before printing the wall.
 */
export function makeTestKit(project: Project): Project {
  const p: Project = structuredClone(project);
  const hasFrame = p.wall.shape !== 'honeycomb' && p.frame.width > 0;
  const fw = hasFrame ? p.frame.width : 0;
  // About 5 columns × 3 rows of whole cells; sized so the lattice splits into exactly one panel on a 158 mm bed (the frame then does not fit and gets split).
  const innerW = 6.2 * PITCH_X;
  const innerH = 3.6 * PITCH_Y;
  p.name = `${project.name || 'hsw'} test`;
  p.wall = { shape: p.wall.shape === 'honeycomb' ? 'honeycomb' : 'rect', width: innerW + 2 * fw, height: innerH + 2 * fw, cornerRadius: Math.min(p.wall.cornerRadius, 12), points: [] };
  p.cutouts = [];
  p.cells = {};
  p.grid = { ...p.grid, offsetX: 0, offsetY: 0 };
  p.mount = { ...p.mount, perPanel: 1 };
  // A bed just big enough for the panel forces the frame into several jointed parts.
  const bed = 158;
  p.printer = { ...p.printer, preset: 'custom', bedW: bed, bedH: bed, margin: 0 };
  p.accessories = [
    { id: 'kit-cap', type: 'cap', c: 0, r: 0, params: { ...defaultParams('cap'), dome: 0 }, color: '#f2a93b' },
    { id: 'kit-hook', type: 'hook', c: 2, r: 0, params: defaultParams('hook'), color: '#f2a93b' },
  ];
  p.customModels = [];
  return p;
}
