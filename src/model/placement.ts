import { accessoryDef } from '../geometry/accessories/defs';
import type { Layout } from '../geometry/layoutTypes';
import { cellKey, type Accessory } from './types';

export function pegCells(a: Pick<Accessory, 'type' | 'c' | 'r' | 'params'>): { c: number; r: number }[] {
  const def = accessoryDef(a.type);
  return (def?.pegs(a.params) ?? [[0, 0]]).map(([dc, dr]) => ({ c: a.c + dc, r: a.r + dr }));
}

/** Map of cell key -> kind, for quick placement checks. */
export function cellIndex(layout: Layout | null) {
  const m = new Map<string, string>();
  for (const c of layout?.cells ?? []) m.set(cellKey(c.c, c.r), c.kind);
  return m;
}

export function isPlacementValid(
  a: Pick<Accessory, 'id' | 'type' | 'c' | 'r' | 'params'>,
  index: Map<string, string>,
  others: Accessory[],
): boolean {
  const used = new Set<string>();
  for (const o of others) if (o.id !== a.id) for (const p of pegCells(o)) used.add(cellKey(p.c, p.r));
  return pegCells(a).every((p) => {
    const k = cellKey(p.c, p.r);
    return index.get(k) === 'hole' && !used.has(k);
  });
}
