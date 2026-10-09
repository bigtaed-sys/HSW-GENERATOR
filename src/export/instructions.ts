import { accessoryDef } from '../geometry/accessories/defs';
import type { Vec2 } from '../geometry/lattice';
import type { Layout, LayoutPiece } from '../geometry/layoutTypes';
import type { Lang, Project } from '../model/types';

const T = {
  ru: {
    title: 'Инструкция по сборке',
    overview: 'Обзор',
    size: 'Размер',
    parts: 'Деталей',
    panels: 'панелей',
    frame: 'частей рамки',
    filament: 'Пластик',
    printList: 'Что напечатать',
    piece: 'Деталь',
    printSize: 'Размер на столе',
    rotation: 'Поворот',
    step: 'Шаг',
    prepare: 'Разметка',
    prepareText: (w: string, h: string) =>
      `Отметьте на стене прямоугольник ${w} × ${h} мм и проведите горизонталь по уровню. Номера деталей выгравированы на донышке ячейки под саморез (панели) и на обратной стороне (рамка).`,
    rowTitle: (r: string) => `Панели ряда ${r}`,
    rowText: (list: string, n: number) =>
      `Установите панели ${list} снизу вверх, слева направо. Края соседних панелей входят друг в друга зигзагом. Прикрутите через ячейки с донышком: ${n} саморезов.`,
    rowTextConn: (list: string, n: number) =>
      `Приложите панели ${list} к уже установленным, края входят друг в друга зигзагом. Защёлкните соединители, отмеченные на схеме (${n} шт.), и закрутите в каждый по одному саморезу.`,
    frameUnder: 'Рамка: нижние части',
    frameUnderText: (list: string, n: number) =>
      `Приложите части ${list}: их концы лежат снизу в нахлёстах. Губа рамки заходит на края панелей. Пока закрутите только саморезы вне нахлёстов: ${n} шт.`,
    frameOver: 'Рамка: верхние части',
    frameOverText: (list: string, n: number) =>
      `Наложите части ${list} концами на нижние части и закрутите все саморезы, включая стяжные в нахлёстах: ${n} шт.`,
    frameSingle: 'Рамка',
    frameSingleText: (list: string, n: number) => `Установите части рамки ${list} и прикрутите их: ${n} саморезов.`,
    accessories: 'Аксессуары',
    accessoriesText: 'Вставьте аксессуары в ячейки до щелчка, как на схеме.',
    noAccessories: 'Аксессуаров нет.',
    total: 'Всего саморезов',
  },
  en: {
    title: 'Assembly instructions',
    overview: 'Overview',
    size: 'Size',
    parts: 'Parts',
    panels: 'panels',
    frame: 'frame parts',
    filament: 'Filament',
    printList: 'Print list',
    piece: 'Part',
    printSize: 'Size on the bed',
    rotation: 'Rotation',
    step: 'Step',
    prepare: 'Mark out',
    prepareText: (w: string, h: string) =>
      `Mark a ${w} × ${h} mm rectangle on the wall and draw a level line. Part labels are engraved on a screw-cell floor (panels) and on the back (frame).`,
    rowTitle: (r: string) => `Panels, row ${r}`,
    rowText: (list: string, n: number) =>
      `Fit panels ${list} from the bottom up, left to right. Neighbouring edges interlock in a zigzag. Screw them through the screw cells: ${n} screws.`,
    rowTextConn: (list: string, n: number) =>
      `Place panels ${list} against the ones already up; the edges interlock in a zigzag. Snap in the connectors marked on the diagram (${n}) and drive one screw into each.`,
    frameUnder: 'Frame: lower parts',
    frameUnderText: (list: string, n: number) =>
      `Place parts ${list}; their ends lie underneath at the joints. The frame lip goes over the panel edges. For now only drive the screws outside the joints: ${n}.`,
    frameOver: 'Frame: upper parts',
    frameOverText: (list: string, n: number) =>
      `Lay parts ${list} with their ends on top of the lower parts and drive all screws, including the ones through the joints: ${n}.`,
    frameSingle: 'Frame',
    frameSingleText: (list: string, n: number) => `Fit frame parts ${list} and screw them on: ${n} screws.`,
    accessories: 'Accessories',
    accessoriesText: 'Click the accessories into their cells as shown.',
    noAccessories: 'No accessories.',
    total: 'Screws in total',
  },
};

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function miniMap(layout: Layout, current: Set<string>, done: Set<string>, extra = ''): string {
  const [x0, y0, x1, y1] = layout.pieces.reduce(
    (b, p) => [Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const pad = 20;
  const d = (polys: Vec2[][]) => polys.map((q) => 'M' + q.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join('L') + 'Z').join('');
  // Frame on top so its lip and joints read correctly.
  const order = [...layout.pieces].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'panel' ? -1 : 1));
  const shapes = order
    .map((p) => {
      const cur = current.has(p.id);
      const fill = cur ? '#f2a93b' : done.has(p.id) ? (p.kind === 'frame' ? '#d9c2a6' : '#c9c9c9') : '#f4f4f4';
      return `<path d="${d(p.polys)}" fill="${fill}" fill-rule="evenodd" stroke="${cur ? '#9a5b00' : '#888'}" stroke-width="${cur ? 2 : 1}"/>`;
    })
    .join('');
  const labels = layout.pieces
    .map(
      (p) =>
        `<text x="${p.anchor[0].toFixed(1)}" y="${(-p.anchor[1] + 5).toFixed(1)}" font-size="${p.kind === 'frame' ? 11 : 15}" text-anchor="middle" font-weight="700" fill="${current.has(p.id) ? '#1d1406' : '#666'}">${p.label}</text>`,
    )
    .join('');
  return `<svg viewBox="${x0 - pad} ${-y1 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" class="map">${shapes}${extra}${labels}</svg>`;
}

/** A self-contained, printable HTML page with numbered assembly steps. */
export function instructionsHtml(
  project: Project,
  layout: Layout,
  lang: Lang,
  accessoryOutlines: (a: Project['accessories'][number]) => Vec2[][] | null,
  cellXY: (c: number, r: number) => Vec2,
): string {
  const t = T[lang];
  const panels = layout.pieces.filter((p) => p.kind === 'panel');
  const frame = layout.pieces.filter((p) => p.kind === 'frame');
  const mountsOf = (p: LayoutPiece) => layout.cells.filter((c) => c.panel === p.id && c.kind === 'mount').length;
  const steps: { title: string; text: string; map: string }[] = [];
  const done = new Set<string>();
  const list = (ps: LayoutPiece[]) => ps.map((p) => p.label).join(', ');

  steps.push({
    title: t.prepare,
    text: t.prepareText(layout.stats.width.toFixed(0), layout.stats.height.toFixed(0)),
    map: miniMap(layout, new Set(), done),
  });

  // Panels: bottom row first (labels start with the row letter, A at the top).
  const rows = new Map<string, LayoutPiece[]>();
  for (const p of panels) {
    const r = p.label.replace(/\d+$/, '');
    rows.set(r, [...(rows.get(r) ?? []), p]);
  }
  const placedConn = new Set<string>();
  for (const r of [...rows.keys()].sort().reverse()) {
    const ps = rows.get(r)!.sort((a, b) => a.bbox[0] - b.bbox[0]);
    const cur = new Set(ps.map((p) => p.id));
    // Connectors go in once every panel they hold is up.
    const conns = layout.connectors.filter((k) => !placedConn.has(k.id) && k.panels.every((id) => cur.has(id) || done.has(id)));
    conns.forEach((k) => placedConn.add(k.id));
    const marks = conns
      .map((k) => `<circle cx="${k.screw[0].toFixed(1)}" cy="${(-k.screw[1]).toFixed(1)}" r="9" fill="#2563eb" stroke="#fff" stroke-width="2"/>`)
      .join('');
    const text = layout.connectors.length ? t.rowTextConn(list(ps), conns.length) : t.rowText(list(ps), ps.reduce((a, p) => a + mountsOf(p), 0));
    steps.push({ title: t.rowTitle(r), text, map: miniMap(layout, cur, done, marks) });
    ps.forEach((p) => done.add(p.id));
  }

  // Frame: parts underneath at the joints first, then the ones on top.
  const key = (x: Vec2) => `${x[0].toFixed(1)},${x[1].toFixed(1)}`;
  const shared = new Map<string, number>();
  for (const p of frame) for (const sc of p.screws) shared.set(key(sc), (shared.get(key(sc)) ?? 0) + 1);
  const under = frame.filter((p) => p.stage === 1);
  const over = frame.filter((p) => p.stage === 2);
  if (frame.length && over.length) {
    const nUnder = under.reduce((a, p) => a + p.screws.filter((sc) => shared.get(key(sc)) === 1).length, 0);
    steps.push({ title: t.frameUnder, text: t.frameUnderText(list(under), nUnder), map: miniMap(layout, new Set(under.map((p) => p.id)), done) });
    under.forEach((p) => done.add(p.id));
    const nOver = over.reduce((a, p) => a + p.screws.length, 0);
    steps.push({ title: t.frameOver, text: t.frameOverText(list(over), nOver), map: miniMap(layout, new Set(over.map((p) => p.id)), done) });
    over.forEach((p) => done.add(p.id));
  } else if (frame.length) {
    const n = frame.reduce((a, p) => a + p.screws.length, 0);
    steps.push({ title: t.frameSingle, text: t.frameSingleText(list(frame), n), map: miniMap(layout, new Set(frame.map((p) => p.id)), done) });
    frame.forEach((p) => done.add(p.id));
  }

  // Accessories.
  const accPaths = project.accessories
    .map((a) => {
      const o = accessoryOutlines(a);
      if (!o) return '';
      const [x, y] = cellXY(a.c, a.r);
      const d = o.map((q) => 'M' + q.map(([px, py]) => `${(px + x).toFixed(1)},${(-(py + y)).toFixed(1)}`).join('L') + 'Z').join('');
      return `<path d="${d}" fill="${a.color}" stroke="#333" stroke-width="1"/>`;
    })
    .join('');
  const counts = new Map<string, number>();
  for (const a of project.accessories) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  const accList = [...counts].map(([type, n]) => `${esc(accessoryDef(type)?.name[lang] ?? type)} × ${n}`).join(', ');
  steps.push({
    title: t.accessories,
    text: project.accessories.length ? `${t.accessoriesText} ${accList}.` : t.noAccessories,
    map: miniMap(layout, new Set(), done, accPaths),
  });

  const totalScrews = panels.reduce((a, p) => a + mountsOf(p), 0) + layout.connectors.length + [...shared.keys()].length;
  const grams = layout.stats.volume * 1.24;
  const rowsHtml = layout.pieces
    .map(
      (p) =>
        `<tr><td><b>${p.label}</b></td><td>${p.printSize[0].toFixed(0)} × ${p.printSize[1].toFixed(0)} mm</td><td>${p.printAngle ?? '—'}°</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.name)} — ${t.title}</title>
<style>
  body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1a17; background: #fff; margin: 0; padding: 24px; line-height: 1.45; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 0 0 6px; }
  .muted { color: #6b665e; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 20px; }
  .card { border: 1px solid #e4e1dc; border-radius: 12px; padding: 14px; break-inside: avoid; page-break-inside: avoid; }
  .num { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #f2a93b; color: #1d1406; font-weight: 700; font-size: 13px; margin-right: 8px; }
  .map { width: 100%; height: auto; max-height: 260px; margin-top: 10px; }
  table { border-collapse: collapse; font-size: 13px; width: 100%; } td, th { padding: 4px 8px; border-bottom: 1px solid #eee; text-align: left; }
  .stats { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 10px; } .stats b { font-size: 18px; display: block; }
  @media print { body { padding: 0; } .card { border-color: #ccc; } }
</style></head><body>
<h1>${esc(project.name)}</h1>
<div class="muted">${t.title}</div>
<div class="stats">
  <div><span class="muted">${t.size}</span><b>${layout.stats.width.toFixed(0)} × ${layout.stats.height.toFixed(0)} mm</b></div>
  <div><span class="muted">${t.parts}</span><b>${panels.length} ${t.panels} + ${frame.length} ${t.frame}</b></div>
  <div><span class="muted">${t.total}</span><b>${totalScrews} × ⌀${project.mount.screwDiameter} mm</b></div>
  <div><span class="muted">${t.filament}</span><b>≈ ${grams >= 1000 ? (grams / 1000).toFixed(2) + ' kg' : grams.toFixed(0) + ' g'}</b></div>
</div>
<div class="grid">
${steps.map((s, i) => `<section class="card"><h2><span class="num">${i + 1}</span>${esc(s.title)}</h2><div>${s.text}</div>${s.map}</section>`).join('\n')}
<section class="card"><h2>${t.printList}</h2><table><tr><th>${t.piece}</th><th>${t.printSize}</th><th>${t.rotation}</th></tr>${rowsHtml}</table></section>
</div>
</body></html>`;
}
