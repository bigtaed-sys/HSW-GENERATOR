// Frame style catalogue. Pure data so the UI can import it; geometry lives in ./build.ts.
// To add a style: describe it here, then add its builder to FRAME_BUILDERS in ./build.ts.

import { param, type ParamDef, type Text } from '../params';

export interface FrameStyleDef {
  id: string;
  name: Text;
  /** Front profile icon, an SVG path in a 20×20 box (wall side at the bottom). */
  icon: string;
  params: ParamDef[];
  /** Narrowest frame the style works on; picking the style widens a narrower frame to `width`. */
  minWidth?: number;
  width?: number;
  /** Shown under the style parameters (i18n-free, both languages). */
  note?: Text;
}

const profileParam: ParamDef = {
  key: 'profile',
  label: { ru: 'Край', en: 'Edge' },
  min: 0,
  max: 2,
  step: 1,
  def: 2,
  unit: '',
  options: [
    { value: 0, label: { ru: 'Прямой', en: 'Square' } },
    { value: 1, label: { ru: 'Фаска', en: 'Chamfer' } },
    { value: 2, label: { ru: 'Скругление', en: 'Round' } },
  ],
};

export const FRAME_STYLES: FrameStyleDef[] = [
  {
    id: 'classic',
    name: { ru: 'Классика', en: 'Classic' },
    icon: 'M2 17 V5 H11 A6 6 0 0 1 17 11 V17 Z',
    params: [profileParam, param('size', 'Размер края', 'Edge size', 0.5, 10, 4, 0.5)],
  },
  {
    id: 'stepped',
    name: { ru: 'Ступенька', en: 'Stepped' },
    icon: 'M2 17 V5 H8 A2 2 0 0 1 10 7 V9 H15 A2 2 0 0 1 17 11 V17 Z',
    params: [
      param('ratio', 'Ширина верхней ступени', 'Top step width', 25, 75, 50, 1, '%'),
      param('drop', 'Высота ступени', 'Step height', 0.6, 6, 2, 0.2),
      param('size', 'Скругление', 'Rounding', 0, 4, 1.5, 0.5),
    ],
  },
  {
    id: 'groove',
    name: { ru: 'С канавкой', en: 'Grooved' },
    icon: 'M2 17 V5 H8 L9.5 8 L11 5 H13 A4 4 0 0 1 17 9 V17 Z',
    params: [
      param('groove', 'Ширина канавки', 'Groove width', 1, 8, 2.4, 0.2),
      param('depth', 'Глубина канавки', 'Groove depth', 0.4, 4, 1.2, 0.2),
      {
        key: 'shape',
        label: { ru: 'Форма канавки', en: 'Groove shape' },
        min: 0,
        max: 1,
        step: 1,
        def: 1,
        unit: '',
        options: [
          { value: 0, label: { ru: 'П-образная', en: 'Square' } },
          { value: 1, label: { ru: 'V-образная', en: 'V' } },
        ],
      },
      param('size', 'Скругление края', 'Edge rounding', 0, 8, 3, 0.5),
    ],
  },
  {
    id: 'bevel',
    name: { ru: 'Багет', en: 'Bevel' },
    icon: 'M2 17 V11 L17 5 V17 Z',
    params: [
      param('drop', 'Перепад', 'Slope drop', 1, 8, 4, 0.5),
      param('flat', 'Плоская полка у сот', 'Flat inner shelf', 0, 60, 20, 1, '%'),
    ],
  },
  {
    id: 'bead',
    name: { ru: 'Валик', en: 'Bead' },
    icon: 'M2 17 V5 A3 3 0 0 1 8 5 V10 H17 V17 Z',
    params: [
      param('bead', 'Ширина валика', 'Bead width', 3, 16, 6, 0.5),
      param('drop', 'Высота валика', 'Bead height', 0.6, 6, 2, 0.2),
    ],
  },
  {
    id: 'cove',
    name: { ru: 'Выкружка', en: 'Cove' },
    icon: 'M2 17 V5 Q12 5 17 12 V17 Z',
    params: [
      param('drop', 'Глубина', 'Depth', 1, 8, 4, 0.5),
      param('flat', 'Плоская полка у края', 'Flat outer rim', 0, 50, 15, 1, '%'),
    ],
  },
  {
    id: 'cells',
    name: { ru: 'Мелкие соты', en: 'Small cells' },
    icon: 'M2 17 V5 H4 V7 H6 V5 H8 V7 H10 V5 H11 A6 6 0 0 1 17 11 V17 Z',
    minWidth: 28,
    width: 40,
    params: [
      param('size', 'Скругление края', 'Edge rounding', 0, 10, 4, 0.5),
      param('cell', 'Размер ячейки', 'Cell size', 4, 24, 9, 0.5),
      param('rib', 'Перемычка', 'Rib', 0.8, 4, 1.6, 0.1),
      param('depth', 'Глубина', 'Depth', 0.2, 3, 0.8, 0.1),
      param('margin', 'Поле у краёв', 'Border', 0, 15, 4, 0.5),
    ],
    note: {
      ru: 'Мелкие шестигранные углубления на лицевой стороне. Не заходят на края, саморезы и вырезы.',
      en: 'Small hexagonal pockets in the front. They stay clear of the edges, screws and cutouts.',
    },
  },
  {
    id: 'lit',
    name: { ru: 'Соты на просвет', en: 'Backlit cells' },
    icon: 'M2 17 V5 H5 V8 H6 V5 H9 V8 H10 V5 H11 A6 6 0 0 1 17 11 V17 H15 V9 H4 V17 Z',
    minWidth: 35,
    width: 50,
    params: [
      param('size', 'Скругление края', 'Edge rounding', 0, 10, 4, 0.5),
      param('groove', 'Ширина канавки', 'Groove width', 1, 6, 2.4, 0.1),
      param('skin', 'Дно канавки', 'Groove floor', 0.2, 1.6, 0.6, 0.04),
      param('plate', 'Лицевая пластина', 'Front plate', 1.5, 8, 3, 0.1),
      param('wall', 'Стенки полости', 'Hollow walls', 1.2, 8, 2.5, 0.1),
      param('patch', 'Накладка на стык', 'Seam patch', 0.2, 2, 0.6, 0.1),
      param('patchWidth', 'Ширина накладки', 'Patch width', 8, 30, 16, 1),
    ],
    note: {
      ru: 'Сетка стены продолжается на рамке канавками с тонким дном. Рамка полая сзади: лента внутри подсвечивает узор через обычный, не прозрачный пластик, светлый светится лучше. Дно делайте в 2–3 слоя. Отдельные части режутся по канавкам, так что узор идёт через стык; сзади шов закрывает тонкая накладка (J1, J2…), её вклеивают в полость под пластину. Отдельные части рамки экспортируются лицом вниз; рамка заодно с панелями печатается спиной вниз, пластина над полостью идёт мостом.',
      en: 'The wall honeycomb continues over the frame as grooves with a thin floor. The frame is hollow at the back: an LED strip inside makes the pattern glow through ordinary (not transparent) plastic; light colours work best. Make the floor 2–3 layers thick. Separate parts are cut along the grooves, so the pattern runs across the seams; a thin patch (J1, J2…) is glued into the hollow behind each seam. Separate frame parts export face down; an integrated frame prints back down, with the plate bridged over the hollow.',
    },
  },
];

export const frameStyle = (id: string) => FRAME_STYLES.find((f) => f.id === id) ?? FRAME_STYLES[0];

/** Parameters of the frame's current style, filled in with defaults. */
export function frameStyleParams(frame: { style: string; styleParams: Record<string, Record<string, number>> }) {
  const def = frameStyle(frame.style);
  return { ...Object.fromEntries(def.params.map((p) => [p.key, p.def])), ...frame.styleParams[def.id] };
}
