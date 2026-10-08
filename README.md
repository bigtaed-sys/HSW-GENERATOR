# HSW Studio

Конструктор стены **Honeycomb Storage Wall (HSW)** в браузере · Browser-based designer for the **Honeycomb Storage Wall**.

[Русский](#русский) · [English](#english)

---

## Русский

Проектируете стену целиком, а не одну панель: форма, размер, рамка, вырезы под розетки, аксессуары. Приложение само режет стену на панели под ваш принтер и выдаёт готовые к печати STL или 3MF.

### Возможности

- **Вся стена сразу.** 2D-редактор с зумом и панорамой и 3D-превью с тенями и разнесённым видом.
- **Формы:** прямоугольник со скруглёнными углами, шестиугольник, эллипс и классический «край по сотам».
- **Рамка:** ширина, профиль переднего края (прямой, фаска, скругление), выступ над сотами, внутренняя фаска, отверстия под саморезы. Рамка автоматически режется на части под стол принтера; разрезы на прямых участках ставятся симметрично.
- **Ячейки у края:** только целые или обрезанные по контуру. Минимальная стенка у края, сдвиг и смена шахматного порядка сетки.
- **Автонарезка на панели** под выбранный принтер (пресеты Bambu, Prusa, Creality, Voron или свой размер). Швы идут по середине стенок между ячейками. Панели подписаны (A1, B2, …) и при экспорте разворачиваются так, чтобы влезть на стол.
- **Крепление:** ячейки под саморез с донышком и потайным отверстием расставляются автоматически, их можно добавлять и убирать вручную. Есть инструмент «сплошная ячейка».
- **Вырезы** под розетки и выключатели: бортик вокруг, фаска, перетаскивание мышью.
- **Библиотека аксессуаров:** крючок, штырь, держатель плоскогубцев, полка, коробка, рейка для отвёрток, кольцо, табличка, заглушка. У каждого свои параметры. Вставки (inserts) генерируются автоматически, а редактор проверяет, что они попадают в свободные ячейки.
- **Свои модели:** загрузите STL, чтобы увидеть его на стене при планировании.
- **Экспорт:** ZIP со STL или один 3MF, схема сборки в SVG, оценка расхода пластика.
- **Проект:** сохранение в файл, ссылка на проект, автосохранение в браузере, отмена и повтор.
- Интерфейс на русском и английском, светлая и тёмная тема, адаптивная вёрстка.

### Горячие клавиши

| Клавиша | Действие |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Отменить / повторить |
| `Delete` | Удалить выбранное |
| Стрелки | Сдвинуть аксессуар на ячейку |
| `F` | Показать всё |
| `1` / `2` | 2D / 3D |
| `Esc` | Отменить установку или выделение |
| `Shift` + клик | Поставить несколько аксессуаров подряд |
| `Alt` + перетаскивание, колесо, средняя кнопка | Навигация |

---

## English

Design the whole wall instead of one panel at a time. Set the shape, size, frame, cutouts for sockets and accessories. The app splits the wall into panels that fit your printer and exports print-ready STL or 3MF files.

### Features

- **Whole-wall editor.** 2D editor with zoom and pan, plus a 3D preview with shadows and an exploded view.
- **Shapes:** rounded rectangle, hexagon, ellipse and the classic honeycomb edge.
- **Frames:** width, front-edge profile (square, chamfer or round), how far it stands out over the cells, inner chamfer and screw holes. The frame is split automatically to fit the bed, with symmetric cuts on straight edges.
- **Edge cells:** whole cells only, or cells cut along the outline. Set the minimum edge wall, shift the grid or flip the column stagger.
- **Automatic panel splitting** for your printer (Bambu, Prusa, Creality and Voron presets, or a custom bed). Seams run along the middle of the walls between cells. Panels are labelled (A1, B2, …) and rotated on export so they fit the bed.
- **Mounting:** screw cells with a floor and a countersunk hole are placed automatically. You can add or remove them by hand, and make any cell solid.
- **Cutouts** for sockets and switches, with a rim and a chamfer, moved by dragging.
- **Accessory library:** hook, peg, plier holder, shelf, bin, screwdriver rack, ring holder, label plate and cap, each with its own parameters. The inserts are generated automatically, and the editor checks that they land on free cells.
- **Your own STLs:** upload a model to see it on the wall while you plan.
- **Export:** a ZIP of STLs or one 3MF, an SVG assembly sheet and a filament estimate.
- **Projects:** save to a file, share as a link, autosave in the browser, undo and redo.
- English and Russian UI, light and dark themes, responsive layout.

### Development

```bash
npm install
npm run dev      # dev server
npm test         # geometry tests (layout, watertight solids)
npm run build    # production build in dist/
```

The app is a static site, built with TypeScript, React, Three.js (react-three-fiber) and [manifold-3d](https://github.com/elalish/manifold) (WASM CSG). All geometry runs in a Web Worker.

### Publishing on GitHub Pages

The ready-to-serve build is committed in `docs/`. After changing the code, rebuild it:

```bash
npm run build:pages   # writes docs/ (plus docs/.nojekyll)
```

In the repository, set *Settings → Pages → Build and deployment → Source: Deploy from a branch*, then pick *Branch: `main`* and *folder: `/docs`*.

### Geometry

| Parameter | Value |
| --- | --- |
| Hole (flat to flat) | 20 mm |
| Wall on each side of a hole | 1.8 mm (pitch 23.6 mm) |
| Panel depth | 8 mm |
| Front recess | 22 mm, from 6 mm deep |
| Back chamfer | 0.4 mm |

These values match the original HSW and the community OpenSCAD generators that reproduce it. The generated inserts (19.7 mm body, 22.5 mm lip, snap ridges) are compatible-by-design, but print a small test piece first. Tolerances vary between printers.

### Credits

- Honeycomb Storage Wall is the original design by **RostaP** ([Printables](https://www.printables.com/model/152592-honeycomb-storage-wall)).
- Reference dimensions were taken from the community OpenSCAD work by Xander, EdwinEesting and geru ([geru/3d-scad-hsw-customizable](https://github.com/geru/3d-scad-hsw-customizable), CC BY 4.0) and from the insert parameters in [CameronBrooks11/honeycomb-wall-scad](https://github.com/CameronBrooks11/honeycomb-wall-scad). No code was copied from either project.
