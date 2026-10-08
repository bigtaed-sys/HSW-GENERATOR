// Accessory catalogue. Pure data (no geometry kernel) so the UI can import it.

export interface ParamDef {
  key: string;
  label: { ru: string; en: string };
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
}

export interface AccessoryDef {
  type: string;
  name: { ru: string; en: string };
  desc: { ru: string; en: string };
  icon: string;
  category: 'hooks' | 'storage' | 'tools' | 'misc';
  params: ParamDef[];
  /** Insert positions relative to the anchor cell, as [column offset, row offset]. */
  pegs: (p: Record<string, number>) => [number, number][];
  /** Rotation (degrees about X, Y, Z) that lays the part on the print bed. Defaults to lying on its side. */
  printRot?: [number, number, number];
}

const P = (
  key: string,
  ru: string,
  en: string,
  min: number,
  max: number,
  def: number,
  step = 1,
  unit = 'mm',
): ParamDef => ({ key, label: { ru, en }, min, max, def, step, unit });

/** Horizontally spaced pegs are two columns apart so they stay on the same lattice row. */
const rowPegs = (n: number): [number, number][] => Array.from({ length: Math.max(1, Math.round(n)) }, (_, i) => [i * 2, 0]);

export const ACCESSORIES: AccessoryDef[] = [
  {
    type: 'hook',
    name: { ru: 'Крючок', en: 'Hook' },
    desc: { ru: 'Классический J-крючок', en: 'Classic J hook' },
    icon: 'hook',
    category: 'hooks',
    params: [
      P('length', 'Вылет', 'Reach', 12, 100, 35),
      P('width', 'Ширина', 'Width', 6, 24, 10),
      P('thickness', 'Толщина', 'Thickness', 3, 10, 5),
      P('tip', 'Высота кончика', 'Tip height', 0, 40, 12),
    ],
    pegs: () => [[0, 0]],
  },
  {
    type: 'peg',
    name: { ru: 'Штырь', en: 'Peg' },
    desc: { ru: 'Круглый штырь с упором', en: 'Round peg with a stop' },
    icon: 'peg',
    category: 'hooks',
    params: [
      P('length', 'Длина', 'Length', 15, 160, 60),
      P('diameter', 'Диаметр', 'Diameter', 4, 16, 8),
      P('angle', 'Наклон вверх', 'Upward tilt', 0, 30, 8, 1, '°'),
      P('knob', 'Упор на конце', 'End stop', 0, 6, 2),
    ],
    pegs: () => [[0, 0]],
  },
  {
    type: 'plier',
    name: { ru: 'Держатель плоскогубцев', en: 'Plier holder' },
    desc: { ru: 'Два штыря — инструмент вешается за ручки', en: 'Two prongs to hang tools by their handles' },
    icon: 'plier',
    category: 'tools',
    params: [
      P('length', 'Длина', 'Length', 20, 120, 50),
      P('gap', 'Зазор', 'Gap', 4, 40, 14),
      P('diameter', 'Диаметр', 'Diameter', 4, 12, 6),
      P('angle', 'Наклон вверх', 'Upward tilt', 0, 30, 10, 1, '°'),
    ],
    pegs: () => [[0, 0]],
  },
  {
    type: 'shelf',
    name: { ru: 'Полка', en: 'Shelf' },
    desc: { ru: 'Полка с бортиком и косынками', en: 'Shelf with a lip and gussets' },
    icon: 'shelf',
    category: 'storage',
    params: [
      P('pegs', 'Креплений', 'Inserts', 2, 6, 2, 1, ''),
      P('width', 'Ширина', 'Width', 60, 260, 100),
      P('depth', 'Глубина', 'Depth', 30, 200, 80),
      P('thickness', 'Толщина', 'Thickness', 3, 8, 4),
      P('lip', 'Бортик', 'Lip', 0, 20, 6),
    ],
    pegs: (p) => rowPegs(p.pegs),
  },
  {
    type: 'bin',
    name: { ru: 'Коробка', en: 'Bin' },
    desc: { ru: 'Открытый контейнер', en: 'Open storage bin' },
    icon: 'bin',
    category: 'storage',
    params: [
      P('pegs', 'Креплений', 'Inserts', 1, 6, 2, 1, ''),
      P('width', 'Ширина', 'Width', 30, 260, 80),
      P('height', 'Высота', 'Height', 20, 160, 55),
      P('depth', 'Глубина', 'Depth', 20, 160, 55),
      P('front', 'Высота передней стенки', 'Front height', 20, 100, 65, 1, '%'),
      P('wall', 'Стенка', 'Wall', 1.2, 4, 1.8, 0.1),
    ],
    pegs: (p) => rowPegs(p.pegs),
  },
  {
    type: 'rack',
    name: { ru: 'Рейка для отвёрток', en: 'Screwdriver rack' },
    desc: { ru: 'Планка с отверстиями', en: 'Bar with holes' },
    icon: 'rack',
    category: 'tools',
    params: [
      P('pegs', 'Креплений', 'Inserts', 1, 6, 2, 1, ''),
      P('holes', 'Отверстий', 'Holes', 1, 20, 5, 1, ''),
      P('hole', 'Диаметр отверстия', 'Hole diameter', 3, 40, 9),
      P('depth', 'Глубина', 'Depth', 20, 100, 36),
      P('width', 'Ширина', 'Width', 30, 260, 100),
    ],
    pegs: (p) => rowPegs(p.pegs),
  },
  {
    type: 'ring',
    name: { ru: 'Кольцо', en: 'Ring holder' },
    desc: { ru: 'Для баллончиков, скотча, бутылок', en: 'For cans, tape rolls, bottles' },
    icon: 'ring',
    category: 'storage',
    params: [
      P('pegs', 'Креплений', 'Inserts', 1, 3, 1, 1, ''),
      P('diameter', 'Внутренний диаметр', 'Inner diameter', 15, 140, 52),
      P('height', 'Высота', 'Height', 6, 60, 16),
      P('wall', 'Стенка', 'Wall', 2, 6, 3),
      P('floor', 'Дно', 'Floor', 0, 1, 0, 1, ''),
    ],
    pegs: (p) => rowPegs(p.pegs),
  },
  {
    type: 'label',
    name: { ru: 'Табличка', en: 'Label plate' },
    desc: { ru: 'Плоская табличка для подписи', en: 'Flat plate for a label' },
    icon: 'label',
    category: 'misc',
    params: [
      P('pegs', 'Креплений', 'Inserts', 1, 6, 2, 1, ''),
      P('width', 'Ширина', 'Width', 30, 260, 80),
      P('height', 'Высота', 'Height', 12, 60, 22),
      P('thickness', 'Толщина', 'Thickness', 2, 6, 3),
    ],
    pegs: (p) => rowPegs(p.pegs),
    printRot: [180, 0, 0],
  },
  {
    type: 'cap',
    name: { ru: 'Заглушка', en: 'Cap' },
    desc: { ru: 'Закрывает ячейку', en: 'Covers a cell' },
    icon: 'cap',
    category: 'misc',
    params: [P('dome', 'Выпуклость', 'Dome', 0, 6, 1.5, 0.5)],
    pegs: () => [[0, 0]],
  },
];

export const accessoryDef = (type: string) => ACCESSORIES.find((a) => a.type === type);

export function defaultParams(type: string): Record<string, number> {
  const d = accessoryDef(type);
  return Object.fromEntries((d?.params ?? []).map((p) => [p.key, p.def]));
}
